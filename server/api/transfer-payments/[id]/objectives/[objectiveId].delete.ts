import { authorizeTransferPaymentObjectiveResource } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentWrite } from '~~/server/utils/transfer-payment-write-transaction'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
// eslint-disable-next-line local/require-authorize -- delegated to authorizeTransferPaymentObjectiveResource
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const objectiveId = getRouterParam(event, 'objectiveId')
  if (!profileId || !objectiveId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const access = await authorizeTransferPaymentObjectiveResource(event, 'delete', profileId, objectiveId)
  if (!access) {
    return await notFound(event, 'TRANSFER_PAYMENT_OBJECTIVE_NOT_FOUND', 'apiErrors.transfer_payment.objective_not_found')
  }

  return await executeFreshAuthorizedTransferPaymentWrite(
    event,
    db,
    profileId,
    access.agencyId,
    'delete',
    async trx => {
      const lockedObjective = await trx
        .selectFrom('Transfer_Payment_Objective')
        .select('id')
        .where('id', '=', objectiveId)
        .where('egcs_tp_transferpaymentprofile', '=', profileId)
        .where('_deleted', '=', false)
        .forUpdate('Transfer_Payment_Objective')
        .executeTakeFirst()
      if (!lockedObjective) {
        return await notFound(event, 'TRANSFER_PAYMENT_OBJECTIVE_NOT_FOUND', 'apiErrors.transfer_payment.objective_not_found')
      }

      await trx
        .updateTable('Transfer_Payment_Objective')
        .set({ _deleted: true })
        .where('id', '=', objectiveId)
        .where('egcs_tp_transferpaymentprofile', '=', profileId)
        .where('_deleted', '=', false)
        .execute()

      return { success: true }
    }
  )
})
