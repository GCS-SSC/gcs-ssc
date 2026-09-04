import { authorize } from '~~/server/utils/authorize'
import { createTransferPaymentScopedAuthorizeHandler, authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { notFound, badRequest } from '~~/server/utils/api-errors'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const financialLimitId = getRouterParam(event, 'financialLimitId')

  if (!profileId || !streamId || !financialLimitId)
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(financialLimitId))
    return await notFound(event, 'FINANCIAL_LIMIT_NOT_FOUND', 'apiErrors.transfer_payment.financial_limit_not_found')

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'delete', profileId, streamId)
  if (!streamContext)
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')

  await authorize(event, 'transfer_payment', 'delete', createTransferPaymentScopedAuthorizeHandler('delete', streamContext.scope, db))

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'delete', async trx => {
      const result = await trx.updateTable('Transfer_Payment_Financial_Limits').set({ _deleted: true })
        .where('id', '=', financialLimitId).where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false).returning('id').executeTakeFirst()
      if (!result) return await notFound(event, 'FINANCIAL_LIMIT_NOT_FOUND', 'apiErrors.transfer_payment.financial_limit_not_found')
      return { success: true }
    }
  )
})
