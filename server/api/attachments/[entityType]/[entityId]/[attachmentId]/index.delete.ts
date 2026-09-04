import { getRouterParam } from 'h3'
import { nanoid } from 'nanoid'
import { executeFreshAuthorizedAttachmentWrite } from '~~/server/utils/attachment-target'
import { getAttachmentRouteTarget } from '~~/server/utils/attachment-route'
import { loadTargetAttachment } from '~~/server/utils/attachment-record'
import { enqueueStorageCleanup, processStorageCleanupBatch, storageCleanupLocator } from '~~/server/utils/storage-cleanup-outbox'

export default defineEventHandler(async event => {
  const target = await getAttachmentRouteTarget(event)
  const linkId = getRouterParam(event, 'attachmentId')
  if (!linkId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const deleted = await executeFreshAuthorizedAttachmentWrite(event, target, 'delete', async (trx, _auth, resolved) => {
    const attachment = await loadTargetAttachment(trx, target, linkId, true)
    if (!attachment) return await notFound(event, 'ATTACHMENT_NOT_FOUND', 'apiErrors.attachments.not_found')
    await trx.updateTable('Common_Entity_Attachment').set({ _deleted: true, egcs_cn_updatedat: new Date() })
      .where('id', '=', linkId).where('_deleted', '=', false).execute()
    await trx.updateTable('Common_Attachment').set({ _deleted: true })
      .where('id', '=', attachment.attachment_id).where('_deleted', '=', false).execute()
    await enqueueStorageCleanup(trx, {
      provider_key: attachment.provider_id,
      agency_id: resolved.agencyId,
      purpose: 'attachment',
      object_id: attachment.provider_object_id,
      locator: storageCleanupLocator(attachment.provider_locator)
    })
    return { attachment }
  })
  try {
    await processStorageCleanupBatch(event.context.$db, `request:${nanoid()}`, 1)
  } catch (error) {
    console.error('Failed to drain durable attachment cleanup.', {
      providerId: deleted.attachment.provider_id,
      objectId: deleted.attachment.provider_object_id,
      error
    })
  }
  return { success: true }
})
