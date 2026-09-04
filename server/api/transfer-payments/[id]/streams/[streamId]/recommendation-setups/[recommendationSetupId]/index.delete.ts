import { authorize } from '~~/server/utils/authorize'
import { createTransferPaymentScopedAuthorizeHandler, authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { lockRecommendationSetupForMutation } from '~~/server/utils/recommendation-setup-versioning'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const recommendationSetupId = getRouterParam(event, 'recommendationSetupId')

  if (!profileId || !streamId || !recommendationSetupId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  if (!isPositivePostgresBigintText(recommendationSetupId)) return await notFound(event, 'RECOMMENDATION_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_setup_not_found')

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'delete', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'delete', createTransferPaymentScopedAuthorizeHandler('delete', streamContext.scope, db))

  const result = await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'delete', async trx => {
      const current = await lockRecommendationSetupForMutation(trx, recommendationSetupId, streamId)
      if (!current) return null
      if (current.publicationState !== 'draft') {
        return await badRequest(event, 'RECOMMENDATION_SETUP_NOT_DRAFT', 'apiErrors.request.invalid_status')
      }
      const deleted = await trx.updateTable('Common_Recommendation_Set_Setup')
        .set({ _deleted: true })
        .where('id', '=', recommendationSetupId)
        .where('egcs_cn_scopetype', '=', 'transferpaymentstream')
        .where('egcs_cn_scopeid', '=', streamId)
        .where('_deleted', '=', false)
        .returning('id')
        .executeTakeFirst()
      if (deleted) {
        await trx.updateTable('Common_Recommendation_Setup').set({ _deleted: true })
          .where('egcs_cn_recommendationset', '=', recommendationSetupId)
          .where('_deleted', '=', false).execute()
        await trx.updateTable('Common_Publication').set({ _deleted: true })
          .where('id', '=', recommendationSetupId)
          .where('egcs_cn_state', '=', 'draft')
          .where('_deleted', '=', false).execute()
      }
      return deleted
    }
  )

  if (!result) {
    return await notFound(event, 'RECOMMENDATION_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_setup_not_found')
  }

  return { success: true }
})
