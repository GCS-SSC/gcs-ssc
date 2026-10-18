import { throwIfAgencyUniqueConstraintError } from '~~/server/utils/agency-unique-constraint-errors'
import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { cleanupTemplateUploads, patchAgencyDocumentTemplate } from '~~/server/utils/document-template-routes'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { enqueueStorageCleanup } from '~~/server/utils/storage-cleanup-outbox'
import type { StoredFileUpload } from '~~/server/utils/file-storage'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  const templateId = getRouterParam(event, 'templateId')
  if (!agencyId || !templateId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (![agencyId, templateId].every(isPositivePostgresBigintText)) return await notFound(event, 'DOCUMENT_TEMPLATE_NOT_FOUND', 'apiErrors.document_generation.template_not_found')
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  const replacedAttachmentIds: string[] = []
  const uploads: StoredFileUpload[] = []
  try {
    return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
      const updated = await patchAgencyDocumentTemplate(
        event, trx, agencyId, templateId,
        ids => replacedAttachmentIds.push(...ids),
        stored => uploads.push(stored)
      )
      for (const attachmentId of replacedAttachmentIds) {
        const stillReferenced = await trx.selectFrom('Agency_Document_Template')
          .where('_deleted', '=', false)
          .where(eb => eb.or([
            eb('egcs_ay_templateattachment_en', '=', attachmentId),
            eb('egcs_ay_templateattachment_fr', '=', attachmentId)
          ])).select('id').executeTakeFirst()
        if (stillReferenced) continue
        const attachment = await trx.updateTable('Common_Attachment')
          .set({ _deleted: true }).where('id', '=', attachmentId)
          .where('_deleted', '=', false).returningAll().executeTakeFirst()
        if (!attachment) continue
        await enqueueStorageCleanup(trx, {
          agency_id: agencyId, provider_key: attachment.egcs_cn_provider,
          object_id: attachment.egcs_cn_providerobjectid,
          locator: attachment.egcs_cn_providerlocator, purpose: 'document-template'
        })
      }
      return updated
    })
  } catch (error) {
    await cleanupTemplateUploads(event, event.context.$db, agencyId, uploads)
    return await throwIfAgencyUniqueConstraintError(event, error)
  }
})
