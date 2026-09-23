import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { cleanupTemplateUploads, patchAgencyDocumentTemplate } from '~~/server/utils/document-template-routes'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { deleteStoredAttachmentById } from '~~/server/utils/file-storage'
import type { StoredFileRecord } from '~~/server/utils/file-storage'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  const templateId = getRouterParam(event, 'templateId')
  if (!agencyId || !templateId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (![agencyId, templateId].every(isPositivePostgresBigintText)) return await notFound(event, 'DOCUMENT_TEMPLATE_NOT_FOUND', 'apiErrors.document_generation.template_not_found')
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  const replacedAttachmentIds: string[] = []
  const uploads: StoredFileRecord[] = []
  let updated: Awaited<ReturnType<typeof patchAgencyDocumentTemplate>>
  try {
    updated = await withActiveAgencyMutationTransaction(event, agencyId, async trx =>
      await patchAgencyDocumentTemplate(
        event, trx, agencyId, templateId,
        ids => replacedAttachmentIds.push(...ids),
        stored => uploads.push(stored)
      )
    )
  } catch (error) {
    await cleanupTemplateUploads(event, event.context.$db, agencyId, uploads)
    throw error
  }
  for (const attachmentId of replacedAttachmentIds) {
    try {
      const stillReferenced = await event.context.$db.selectFrom('Agency_Document_Template')
        .where('_deleted', '=', false)
        .where(eb => eb.or([
          eb('egcs_ay_templateattachment_en', '=', attachmentId),
          eb('egcs_ay_templateattachment_fr', '=', attachmentId)
        ])).select('id').executeTakeFirst()
      if (!stillReferenced) await deleteStoredAttachmentById(event.context.$db, attachmentId)
    } catch {
      console.error('Failed to clean up replaced document-template attachment.', {
        attachmentId,
        category: 'storage_cleanup_failed'
      })
    }
  }
  return updated
})
