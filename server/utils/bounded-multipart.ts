import { captureAuditRequestBody } from './audit-request'
/* eslint-disable jsdoc/require-jsdoc -- Typed multipart primitives use descriptive names. */
import { once } from 'node:events'
import Busboy from '@fastify/busboy'
import type { BusboyInstance } from '@fastify/busboy'
import type { H3Event, MultiPartData } from 'h3'

export class MultipartLimitError extends Error {
  constructor() {
    super('Multipart request exceeded its configured size or part limit')
    this.name = 'MultipartLimitError'
  }
}

export class MultipartParseError extends Error {
  constructor() {
    super('Multipart request could not be parsed')
    this.name = 'MultipartParseError'
  }
}

type BoundedMultipartOptions = {
  maxTotalBytes: number
  maxFileBytes: number
  maxFieldBytes?: number
  maxFields?: number
  maxFiles?: number
  maxParts?: number
}

/**
 * Parses multipart data while bounding bytes during socket consumption, before
 * any complete request body can be buffered by H3.
 *
 * @param event - Incoming H3 request event.
 * @param options - Aggregate, part, and field limits enforced while streaming.
 * @returns Parsed multipart parts, or undefined when the request is not multipart.
 */
export const readBoundedMultipartFormData = async (
  event: H3Event,
  options: BoundedMultipartOptions
): Promise<MultiPartData[] | undefined> => {
  const contentType = event.node.req.headers['content-type']
  if (typeof contentType !== 'string' || !contentType.toLowerCase().startsWith('multipart/form-data')) return undefined
  if (!/boundary=(?:"[^"]+"|[^;\s]+)/i.test(contentType)) return undefined

  const parts: MultiPartData[] = []
  let limitExceeded = false
  let fileStreamError: unknown = null
  let parser: BusboyInstance
  try {
    parser = new Busboy({
      headers: event.node.req.headers as ConstructorParameters<typeof Busboy>[0]['headers'],
      limits: {
        fileSize: options.maxFileBytes,
        fieldSize: options.maxFieldBytes ?? 256 * 1024,
        fields: options.maxFields ?? 32,
        files: options.maxFiles ?? 2,
        parts: options.maxParts ?? 40,
        headerPairs: 100,
        headerSize: 16 * 1024
      }
    })
  } catch {
    throw new MultipartParseError()
  }

  parser.on('file', (name, stream, filename, _encoding, mimeType) => {
    const chunks: Buffer[] = []
    stream.on('limit', () => {
      limitExceeded = true
    })
    stream.on('error', (error: unknown) => {
      fileStreamError = error
    })
    stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
    stream.on('end', () => {
      if (!stream.truncated) parts.push({ name, filename, type: mimeType, data: Buffer.concat(chunks) })
    })
  })
  parser.on('field', (name, value, _nameTruncated, valueTruncated, _encoding, mimeType) => {
    if (valueTruncated) {
      limitExceeded = true
      return
    }
    parts.push({ name, ...(mimeType ? { type: mimeType } : {}), data: Buffer.from(value) })
  })
  parser.on('filesLimit', () => {
    limitExceeded = true
  })
  parser.on('fieldsLimit', () => {
    limitExceeded = true
  })
  parser.on('partsLimit', () => {
    limitExceeded = true
  })

  let parserError: unknown
  const completed = new Promise<void>(resolve => {
    parser.once('finish', resolve)
    parser.once('error', error => {
      parserError = error
      resolve()
    })
  })
  let totalBytes = 0
  try {
    // Returning a size error must leave the socket available for its HTTP response.
    for await (const rawChunk of event.node.req.iterator({ destroyOnReturn: false })) {
      const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk)
      totalBytes += chunk.byteLength
      if (totalBytes > options.maxTotalBytes) {
        limitExceeded = true
        break
      }
      if (!parser.write(chunk)) await once(parser, 'drain')
      if (limitExceeded || parserError) break
    }
    if (limitExceeded) throw new MultipartLimitError()
    if (parserError) throw new MultipartParseError()
    parser.end()
    await completed
    if (parserError) throw new MultipartParseError()
    if (limitExceeded) throw new MultipartLimitError()
    if (fileStreamError) throw new MultipartParseError()
    const capturedParts = new Map<string, unknown[]>()
    for (const part of parts) {
      const name = part.name ?? ''
      const values = capturedParts.get(name) ?? []
      values.push(part.filename !== undefined
        ? { filename: part.filename, type: part.type, size: part.data.byteLength }
        : part.data.toString('utf8'))
      capturedParts.set(name, values)
    }
    captureAuditRequestBody(event, Object.fromEntries([...capturedParts].map(([name, values]) =>
      [name, values.length === 1 ? values[0] : values])))
    return parts
  } catch (error: unknown) {
    parser.destroy()
    if (!event.node.req.destroyed) event.node.req.resume()
    if (limitExceeded) throw new MultipartLimitError()
    if (error instanceof MultipartParseError) throw error
    throw new MultipartParseError()
  }
}
