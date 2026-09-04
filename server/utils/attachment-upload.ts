/* eslint-disable jsdoc/require-jsdoc -- Multipart helpers use explicit typed names. */
import type { H3Event, MultiPartData } from 'h3'
import { AttachmentUploadMetadataSchema, type AttachmentUploadMetadata } from '~~/shared/types/schemas'
import { badRequest } from './api-errors'
import { parseI18n } from './api-validate'
import { MultipartLimitError, MultipartParseError, readBoundedMultipartFormData } from './bounded-multipart'

export const MAX_ATTACHMENT_FILE_BYTES = 10 * 1024 * 1024
export const MAX_ATTACHMENT_MULTIPART_BYTES = MAX_ATTACHMENT_FILE_BYTES + (512 * 1024)

export interface AttachmentUploadPayload {
  metadata: AttachmentUploadMetadata
  file: { filename: string; contentType: string; bytes: Buffer }
}

const rejectOversized = async (event: H3Event, parts?: MultiPartData[]): Promise<void> => {
  const rawLength = event.node?.req?.headers['content-length']
  const contentLength = Number(Array.isArray(rawLength) ? rawLength[0] : rawLength)
  const total = parts?.reduce((sum, part) => sum + part.data.byteLength, 0) ?? 0
  if ((Number.isFinite(contentLength) && contentLength > MAX_ATTACHMENT_MULTIPART_BYTES)
    || total > MAX_ATTACHMENT_MULTIPART_BYTES) {
    return await badRequest(event, 'ATTACHMENT_FILE_TOO_LARGE', 'apiErrors.attachments.file_too_large')
  }
}

export const readAttachmentUpload = async (event: H3Event): Promise<AttachmentUploadPayload> => {
  await rejectOversized(event)
  let parts: MultiPartData[] | undefined
  try {
    parts = await readBoundedMultipartFormData(event, {
      maxTotalBytes: MAX_ATTACHMENT_MULTIPART_BYTES,
      maxFileBytes: MAX_ATTACHMENT_FILE_BYTES,
      maxFiles: 2
    })
  } catch (error: unknown) {
    if (error instanceof MultipartLimitError) {
      return await badRequest(event, 'ATTACHMENT_FILE_TOO_LARGE', 'apiErrors.attachments.file_too_large')
    }
    if (error instanceof MultipartParseError) {
      return await badRequest(event, 'INVALID_MULTIPART', 'apiErrors.attachments.invalid_multipart')
    }
    throw error
  }
  if (!parts) return await badRequest(event, 'INVALID_MULTIPART', 'apiErrors.attachments.invalid_multipart')
  await rejectOversized(event, parts)
  const files = parts.filter(part => typeof part.filename === 'string' && part.filename.length > 0)
  if (files.length !== 1 || files[0]?.name !== 'file') {
    return await badRequest(event, 'ATTACHMENT_SINGLE_FILE_REQUIRED', 'apiErrors.attachments.single_file_required')
  }
  const file = files[0]
  if (!file.filename || file.filename.length > 255
    || [...file.filename].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    return await badRequest(event, 'ATTACHMENT_FILENAME_INVALID', 'apiErrors.attachments.filename_invalid')
  }
  if (file.data.byteLength > MAX_ATTACHMENT_FILE_BYTES) {
    return await badRequest(event, 'ATTACHMENT_FILE_TOO_LARGE', 'apiErrors.attachments.file_too_large')
  }
  const fields: Record<string, unknown> = {}
  for (const part of parts) {
    if (!part.filename && part.name) fields[part.name] = part.data.toString('utf8')
  }
  if (typeof fields.providerMetadata === 'string') {
    try {
      fields.providerMetadata = JSON.parse(fields.providerMetadata)
    } catch {
      return await badRequest(event, 'INVALID_PROVIDER_METADATA', 'apiErrors.attachments.invalid_provider_metadata')
    }
  }
  return {
    metadata: await parseI18n(event, AttachmentUploadMetadataSchema, fields),
    file: {
      filename: file.filename!,
      contentType: file.type || 'application/octet-stream',
      bytes: Buffer.from(file.data)
    }
  }
}
