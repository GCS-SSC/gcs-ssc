import { authorize } from '~~/server/utils/authorize'
import { createTransferPaymentScopedAuthorizeHandler, authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const reviewSetupId = getRouterParam(event, 'reviewSetupId')

  if (!profileId || !streamId || !reviewSetupId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  if (!isPositivePostgresBigintText(reviewSetupId)) return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'delete', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'delete', createTransferPaymentScopedAuthorizeHandler('delete', streamContext.scope, db))

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'delete', async trx => {
      const publication = await trx.selectFrom('Common_Publication')
        .innerJoin('Common_Review_Set_Setup', 'Common_Review_Set_Setup.id', 'Common_Publication.id')
        .select(['Common_Publication.id', 'Common_Publication.egcs_cn_state'])
        .where('Common_Publication.id', '=', reviewSetupId)
        .where('Common_Review_Set_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream')
        .where('Common_Review_Set_Setup.egcs_cn_scopeid', '=', streamId)
        .where('Common_Publication._deleted', '=', false)
        .where('Common_Review_Set_Setup._deleted', '=', false)
        .forUpdate('Common_Publication')
        .executeTakeFirst()
      if (!publication) {
        return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
      }
      if (publication.egcs_cn_state !== 'draft') {
        return await badRequest(event, 'REVIEW_SETUP_DELETE_NOT_ALLOWED', 'apiErrors.request.invalid_status')
      }
      await trx.updateTable('Common_Publication').set({ _deleted: true }).where('id', '=', reviewSetupId).execute()
      const updatedSetup = await trx
        .updateTable('Common_Review_Set_Setup')
        .set({ _deleted: true })
        .where('id', '=', reviewSetupId)
        .where('egcs_cn_scopetype', '=', 'transferpaymentstream')
        .where('egcs_cn_scopeid', '=', streamId)
        .where('_deleted', '=', false)
        .executeTakeFirst()

      if (updatedSetup.numUpdatedRows !== BigInt(0)) {
        await trx
          .updateTable('Common_Review_Setup')
          .set({ _deleted: true })
          .where('egcs_cn_reviewset', '=', reviewSetupId)
          .where('_deleted', '=', false)
          .execute()
      }

      if (updatedSetup.numUpdatedRows === BigInt(0)) {
        return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
      }
      return { success: true }
    }
  )
})
