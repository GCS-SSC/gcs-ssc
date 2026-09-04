import { authorize } from '~~/server/utils/authorize'
import { createTransferPaymentScopedAuthorizeHandler, authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
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
  const monitorTypeId = getRouterParam(event, 'monitorTypeId')

  if (!profileId || !streamId || !monitorTypeId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  if (!isPositivePostgresBigintText(monitorTypeId)) {
    return await notFound(event, 'MONITOR_TYPE_NOT_FOUND', 'apiErrors.transfer_payment.monitor_type_not_found')
  }

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'delete', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'delete', createTransferPaymentScopedAuthorizeHandler('delete', streamContext.scope, db))

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'delete', async trx => {
      const reference = await trx.selectFrom('Funding_Case_Agreement_Monitor').select('id')
        .where('egcs_fc_type', '=', monitorTypeId).where('_deleted', '=', false)
        .forUpdate().executeTakeFirst()
      if (reference) {
        return await badRequest(event, 'MONITOR_TYPE_IN_USE', 'apiErrors.transfer_payment.monitor_type_in_use')
      }
      const deleted = await trx.updateTable('Transfer_Payment_Monitor_Type').set({ _deleted: true })
        .where('id', '=', monitorTypeId).where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false).returning('id').executeTakeFirst()
      if (!deleted) return await notFound(event, 'MONITOR_TYPE_NOT_FOUND', 'apiErrors.transfer_payment.monitor_type_not_found')
      return { success: true }
    }
  )
})
