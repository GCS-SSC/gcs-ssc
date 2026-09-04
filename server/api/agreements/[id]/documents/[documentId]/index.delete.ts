import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { deleteStoredFile } from '~~/server/utils/file-storage'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const documentId = getRouterParam(event, 'documentId')
  if (!agreementId || !documentId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  if (![agreementId, documentId].every(isPositivePostgresBigintText)) {
    return await badRequest(event, 'INVALID_IDS', 'apiErrors.request.invalid')
  }

  const agreementContext = await authorizeAgreementResource(event, 'delete', agreementId, db)
  if (!agreementContext) {
    return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  const result = await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, currentContext) => {
    const generatedDocument = await trx
      .selectFrom('Funding_Case_Agreement_Generated_Document')
      .where('id', '=', documentId)
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .select(['egcs_fc_generatedattachment', 'egcs_fc_closeout'])
      .executeTakeFirst()

    if (!generatedDocument) {
      return await notFound(event, 'DOCUMENT_NOT_FOUND', 'apiErrors.document_generation.document_not_found')
    }
    if (generatedDocument.egcs_fc_closeout) {
      return await notFound(event, 'DOCUMENT_NOT_FOUND', 'apiErrors.document_generation.document_not_found')
    }

    const attachment = await trx
      .selectFrom('Common_Attachment')
      .where('id', '=', generatedDocument.egcs_fc_generatedattachment)
      .where('_deleted', '=', false)
      .select(['egcs_cn_provider', 'egcs_cn_providerobjectid', 'egcs_cn_providerlocator'])
      .executeTakeFirst()

    await trx
      .updateTable('Funding_Case_Agreement_Generated_Document')
      .set({ _deleted: true })
      .where('id', '=', documentId)
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .execute()

    await trx
      .updateTable('Common_Attachment')
      .set({ _deleted: true })
      .where('id', '=', generatedDocument.egcs_fc_generatedattachment)
      .where('_deleted', '=', false)
      .execute()

    return { attachment, agencyId: (currentContext ?? agreementContext).agencyId, success: true }
  }, { action: 'delete' })

  if (!('success' in result) || result.success !== true) return result

  if ('attachment' in result && result.attachment) {
    const [cleanup] = await Promise.allSettled([deleteStoredFile(
      db,
      String(result.agencyId),
      result.attachment,
      'generated-document',
      { entityType: 'fundingcaseagreement', entityId: agreementId }
    )])
    if (cleanup?.status === 'rejected') {
      console.error('Failed to clean up deleted agreement document attachment.', {
        agreementId,
        documentId,
        category: 'storage_cleanup_failed'
      })
    }
  }

  return { success: true }
})
