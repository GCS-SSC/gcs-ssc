import { badRequest, notFound } from '~~/server/utils/api-errors'
import { authorizeAmendmentDocumentResource } from '~~/server/utils/amendment-document-generation'
import { assertDraftAgreementAmendment } from '~~/server/utils/agreement-amendment'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { deleteStoredFile } from '~~/server/utils/file-storage'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  const amendmentId = getRouterParam(event, 'amendmentId')
  const documentId = getRouterParam(event, 'documentId')
  if (!agreementId || !amendmentId || !documentId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (![agreementId, amendmentId, documentId].every(isPositivePostgresBigintText)) return await badRequest(event, 'INVALID_IDS', 'apiErrors.request.invalid')
  const db = event.context.$db
  const context = await authorizeAmendmentDocumentResource(event, db, agreementId, amendmentId, 'delete')
  const assignmentTarget = { entityType: 'fundingcaseamendment' as const, entityId: amendmentId }
  const result = await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async (trx, currentContext) => {
    await authorizeAmendmentDocumentResource(event, trx, agreementId, amendmentId, 'delete')
    await assertDraftAgreementAmendment(event, trx, agreementId, amendmentId)
    const generated = await trx.selectFrom('Funding_Case_Agreement_Generated_Document')
      .where('id', '=', documentId).where('egcs_fc_fundingagreement', '=', agreementId)
      .where('egcs_fc_amendment', '=', amendmentId).where('egcs_fc_closeout', 'is', null).where('_deleted', '=', false)
      .select('egcs_fc_generatedattachment').executeTakeFirst()
    if (!generated) return await notFound(event, 'DOCUMENT_NOT_FOUND', 'apiErrors.document_generation.document_not_found')
    const attachment = await trx.selectFrom('Common_Attachment').where('id', '=', generated.egcs_fc_generatedattachment)
      .where('_deleted', '=', false).select(['egcs_cn_provider', 'egcs_cn_providerobjectid', 'egcs_cn_providerlocator']).executeTakeFirst()
    await trx.updateTable('Funding_Case_Agreement_Generated_Document').set({ _deleted: true }).where('id', '=', documentId).execute()
    await trx.updateTable('Common_Attachment').set({ _deleted: true }).where('id', '=', generated.egcs_fc_generatedattachment).execute()
    return { attachment, agencyId: currentContext.agencyId }
  }, { action: 'delete', assignmentTarget, businessStatusTarget: assignmentTarget })
  if (result.attachment) {
    const [cleanup] = await Promise.allSettled([deleteStoredFile(db, result.agencyId, result.attachment, 'generated-document', assignmentTarget)])
    if (cleanup?.status === 'rejected') console.error('Failed to clean up deleted Amendment document attachment.', { agreementId, amendmentId, documentId, category: 'storage_cleanup_failed' })
  }
  return { success: true }
})
