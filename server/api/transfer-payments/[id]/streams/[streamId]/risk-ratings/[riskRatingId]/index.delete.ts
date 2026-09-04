import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { isRiskRatingPinned } from '~~/server/utils/agreement-risk-rating'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const riskRatingId = getRouterParam(event, 'riskRatingId')

  if (!profileId || !streamId || !riskRatingId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  if (!isPositivePostgresBigintText(riskRatingId)) {
    return await notFound(event, 'RISK_RATING_NOT_FOUND', 'apiErrors.transfer_payment.risk_rating_not_found')
  }

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'delete', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'delete', createTransferPaymentScopedAuthorizeHandler('delete', streamContext.scope, db))

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'delete', async trx => {
      if (await isRiskRatingPinned(trx, streamId, riskRatingId)) {
        return await badRequest(event, 'RISK_RATING_WORKFLOW_REFERENCED', 'apiErrors.transfer_payment.risk_rating_workflow_referenced')
      }
      const deleted = await trx.updateTable('Transfer_Payment_Stream_Risk_Rating').set({ _deleted: true })
        .where('id', '=', riskRatingId).where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false).returning('id').executeTakeFirst()
      if (!deleted) return await notFound(event, 'RISK_RATING_NOT_FOUND', 'apiErrors.transfer_payment.risk_rating_not_found')
      return { success: true }
    }
  )
})
