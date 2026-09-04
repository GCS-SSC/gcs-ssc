import { create as contentDisposition } from 'content-disposition'
import { getRouterParam, setResponseHeader } from 'h3'
import { authorizeAttachmentTarget, authorizeFreshAttachmentTarget } from '~~/server/utils/attachment-target'
import { getAttachmentRouteTarget } from '~~/server/utils/attachment-route'
import { loadTargetAttachment } from '~~/server/utils/attachment-record'
import { readProviderObject, resolveAgencyStorageProvider } from '~~/server/utils/file-storage-provider'

export default defineEventHandler(async event => {
  const target = await getAttachmentRouteTarget(event)
  const attachmentId = getRouterParam(event, 'attachmentId')
  if (!attachmentId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const { resolved } = await authorizeAttachmentTarget(event, target, 'read')
  const attachment = await loadTargetAttachment(event.context.$db, target, attachmentId)
  if (!attachment) return await notFound(event, 'ATTACHMENT_NOT_FOUND', 'apiErrors.attachments.not_found')
  const provider = await resolveAgencyStorageProvider(event.context.$db, resolved.agencyId, attachment.provider_id)
  if (!provider) return await throwApiError(event, {
    statusCode: 503, code: 'STORAGE_PROVIDER_UNAVAILABLE', key: 'apiErrors.attachments.provider_unavailable'
  })
  let object: Awaited<ReturnType<typeof readProviderObject>>
  try {
    object = await readProviderObject({
      provider,
      reference: { objectId: attachment.provider_object_id, locator: attachment.provider_locator as Record<string, never> },
      purpose: 'attachment',
      target
    })
  } catch {
    return await throwApiError(event, {
      statusCode: 503, code: 'STORAGE_PROVIDER_READ_FAILED', key: 'apiErrors.attachments.provider_unavailable'
    })
  }
  const { resolved: freshTarget } = await authorizeFreshAttachmentTarget(event, target, 'read', event.context.$db)
  const freshAttachment = await loadTargetAttachment(event.context.$db, target, attachmentId)
  if (!freshAttachment
    || freshTarget.agencyId !== resolved.agencyId
    || freshAttachment.provider_id !== attachment.provider_id
    || freshAttachment.provider_object_id !== attachment.provider_object_id
    || JSON.stringify(freshAttachment.provider_locator) !== JSON.stringify(attachment.provider_locator)) {
    return await notFound(event, 'ATTACHMENT_NOT_FOUND', 'apiErrors.attachments.not_found')
  }
  const filename = attachment.filename
  setResponseHeader(event, 'Content-Type', attachment.mime_type)
  setResponseHeader(event, 'Content-Disposition', contentDisposition(filename))
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return Buffer.from(object.bytes)
})
