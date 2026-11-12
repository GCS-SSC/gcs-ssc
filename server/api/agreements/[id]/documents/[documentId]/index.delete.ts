import { defineEventHandler, getRouterParam } from 'h3'
import { nanoid } from 'nanoid'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { enqueueStorageCleanup, processStorageCleanupBatch } from '~~/server/utils/storage-cleanup-outbox'
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
      .select(['egcs_fc_generatedattachment', 'egcs_fc_closeout', 'egcs_fc_amendment'])
      .executeTakeFirst()

    if (!generatedDocument) {
      return await notFound(event, 'DOCUMENT_NOT_FOUND', 'apiErrors.document_generation.document_not_found')
    }
    if (generatedDocument.egcs_fc_closeout || generatedDocument.egcs_fc_amendment) {
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

    if (attachment) {
      await enqueueStorageCleanup(trx, {
        agency_id: currentContext.agencyId, provider_key: attachment.egcs_cn_provider,
        object_id: attachment.egcs_cn_providerobjectid, locator: attachment.egcs_cn_providerlocator,
        purpose: 'generated-document',
        payload: { target: { entityType: 'fundingcaseagreement', entityId: agreementId } }
      })
    }

    return { success: true }
  }, { action: 'delete' })

  if (!('success' in result) || result.success !== true) return result

  try {
    await processStorageCleanupBatch(db, `request:${nanoid()}`, 1)
  } catch (error) {
    console.error('Failed to drain durable agreement document cleanup.', {
      agreementId, documentId, category: 'storage_cleanup_failed', error
    })
  }

  return { success: true }
})
