import { authorizeTransferPaymentEligibleRecipientResource } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
// eslint-disable-next-line local/require-authorize -- delegated to authorizeTransferPaymentEligibleRecipientResource
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const recipientId = getRouterParam(event, 'eligibleRecipientId')
  if (!profileId || !streamId || !recipientId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const access = await authorizeTransferPaymentEligibleRecipientResource(event, 'delete', profileId, streamId, recipientId)
  if (!access) {
    return await notFound(
      event,
      'TRANSFER_PAYMENT_ELIGIBLE_RECIPIENT_NOT_FOUND',
      'apiErrors.transfer_payment.eligible_recipient_not_found'
    )
  }

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, access.agencyId, streamId, 'delete', async trx => {
      const deleted = await trx.updateTable('Transfer_Payment_Stream_Eligible_Recipient')
        .set({ _deleted: true }).where('id', '=', recipientId)
        .where('egcs_tp_transferpaymentstream', '=', streamId).where('_deleted', '=', false)
        .returning('id').executeTakeFirst()
      if (!deleted) return await notFound(event, 'TRANSFER_PAYMENT_ELIGIBLE_RECIPIENT_NOT_FOUND', 'apiErrors.transfer_payment.eligible_recipient_not_found')
      return { success: true }
    }
  )
})
