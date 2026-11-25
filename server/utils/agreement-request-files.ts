/* eslint-disable jsdoc/require-jsdoc -- Request file operations use explicit typed contracts. */
import { create as contentDisposition } from 'content-disposition'
import { setResponseHeader, type H3Event } from 'h3'
import type { z } from 'zod'
import { MAX_REQUEST_ATTACHMENTS } from '~~/shared/types/correspondence'
import { MAX_ATTACHMENT_FILENAME_LENGTH, MAX_ATTACHMENT_FILE_BYTES } from '~~/shared/utils/attachment-limits'
import { authorizeAgreementRequests, requestFilesForTarget } from './agreement-requests'
import type { AgreementRequestFile } from './agreement-requests'
import { badRequest, notFound, throwApiError } from './api-errors'
import { parseI18n } from './api-validate'
import { MultipartLimitError, MultipartParseError, readBoundedMultipartFormData } from './bounded-multipart'
import { readStoredFile } from './file-storage'
import { executeFreshReadSnapshot } from './fresh-read-snapshot'

const invalidMultipart = async (event: H3Event) => await badRequest(event, 'INVALID_MULTIPART', 'apiErrors.attachments.invalid_multipart')
const tooManyAttachments = async (event: H3Event) =>
  await badRequest(event, 'AGREEMENT_REQUEST_TOO_MANY_ATTACHMENTS', 'apiErrors.agreementRequests.too_many_attachments')

export const readAgreementRequestMultipart = async <Schema extends z.ZodType>(event: H3Event, schema: Schema) => {
  let parts: Awaited<ReturnType<typeof readBoundedMultipartFormData>>
  try {
    parts = await readBoundedMultipartFormData(event, {
      maxFileBytes: MAX_ATTACHMENT_FILE_BYTES + 1,
      maxTotalBytes: MAX_REQUEST_ATTACHMENTS * MAX_ATTACHMENT_FILE_BYTES + 512 * 1024,
      maxFiles: MAX_REQUEST_ATTACHMENTS + 1,
      maxFields: 1,
      maxParts: MAX_REQUEST_ATTACHMENTS + 3
    })
  } catch (error: unknown) {
    if (error instanceof MultipartLimitError) {
      if (error.reason === 'files') return await tooManyAttachments(event)
      return await badRequest(event, 'ATTACHMENT_FILE_TOO_LARGE', 'apiErrors.attachments.file_too_large')
    }
    if (error instanceof MultipartParseError) return await invalidMultipart(event)
    throw error
  }
  const dataPart = parts?.find(part => part.name === 'data' && part.filename === undefined)
  if (!parts || !dataPart || parts.some(part => part !== dataPart && (part.name !== 'file' || part.filename === undefined))) {
    return await invalidMultipart(event)
  }
  const fileParts = parts.filter(part => part !== dataPart)
  if (fileParts.length > MAX_REQUEST_ATTACHMENTS) {
    return await tooManyAttachments(event)
  }
  const files: AgreementRequestFile[] = []
  for (const part of fileParts) {
    const filename = part.filename
    if (!filename || filename.length > MAX_ATTACHMENT_FILENAME_LENGTH || [...filename].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
      return await badRequest(event, 'ATTACHMENT_FILENAME_INVALID', 'apiErrors.attachments.filename_invalid')
    }
    if (part.data.byteLength > MAX_ATTACHMENT_FILE_BYTES) {
      return await badRequest(event, 'ATTACHMENT_FILE_TOO_LARGE', 'apiErrors.attachments.file_too_large')
    }
    files.push({ filename, mimeType: part.type || 'application/octet-stream', bytes: part.data })
  }
  let data: unknown
  try {
    data = JSON.parse(dataPart.data.toString('utf8'))
  } catch {
    return await invalidMultipart(event)
  }
  return { input: await parseI18n(event, schema, data), files }
}

type RequestAttachmentIdentity = { threadId: string; entryId: string; attachmentId: string }

export const authorizeAgreementRequestAttachment = async (event: H3Event, identity: RequestAttachmentIdentity) =>
  await executeFreshReadSnapshot(event, async () => {
    const { db, agreement, target } = await authorizeAgreementRequests(event, 'read')
    const attachment = await requestFilesForTarget(db, target, agreement.agencyId)
      .where('thread.id', '=', identity.threadId).where('entry.id', '=', identity.entryId).where('link.id', '=', identity.attachmentId)
      .select([
        'file.egcs_cn_filename as filename', 'file.egcs_cn_mimetype as mimeType', 'file.egcs_cn_provider',
        'file.egcs_cn_providerobjectid', 'file.egcs_cn_providerlocator'
      ]).executeTakeFirst()
    if (!attachment) return await notFound(event, 'ATTACHMENT_NOT_FOUND', 'apiErrors.attachments.not_found')
    return { identity, attachment, agencyId: agreement.agencyId, target }
  }, { authorization: 'snapshot' })

export const readAgreementRequestAttachment = async (
  event: H3Event, authorized: Awaited<ReturnType<typeof authorizeAgreementRequestAttachment>>
) => {
  const { identity, attachment, agencyId, target } = authorized
  let bytes: Buffer
  try {
    bytes = await readStoredFile(event.context.$db, agencyId, attachment, 'attachment', target)
  } catch {
    return await throwApiError(event, { statusCode: 503, code: 'STORAGE_PROVIDER_READ_FAILED', key: 'apiErrors.attachments.provider_unavailable' })
  }
  const fresh = await authorizeAgreementRequestAttachment(event, identity)
  if (fresh.agencyId !== agencyId || fresh.attachment.egcs_cn_provider !== attachment.egcs_cn_provider
    || fresh.attachment.egcs_cn_providerobjectid !== attachment.egcs_cn_providerobjectid
    || JSON.stringify(fresh.attachment.egcs_cn_providerlocator) !== JSON.stringify(attachment.egcs_cn_providerlocator)) {
    return await notFound(event, 'ATTACHMENT_NOT_FOUND', 'apiErrors.attachments.not_found')
  }
  setResponseHeader(event, 'Content-Type', attachment.mimeType)
  setResponseHeader(event, 'Content-Disposition', contentDisposition(attachment.filename))
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return bytes
}
