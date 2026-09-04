import { authorizeTransferPaymentOutcomeResource } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentWrite } from '~~/server/utils/transfer-payment-write-transaction'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const outcomeId = getRouterParam(event, 'outcomeId')
  if (!profileId || !outcomeId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const access = await authorizeTransferPaymentOutcomeResource(event, 'delete', profileId, outcomeId)
  if (!access) {
    return await notFound(event, 'TRANSFER_PAYMENT_OUTCOME_NOT_FOUND', 'apiErrors.transfer_payment.outcome_not_found')
  }

  return await executeFreshAuthorizedTransferPaymentWrite(
    event,
    db,
    profileId,
    access.agencyId,
    'delete',
    async trx => {
      const lockedOutcome = await trx
        .selectFrom('Transfer_Payment_Outcome')
        .select('id')
        .where('id', '=', outcomeId)
        .where('egcs_tp_transferpaymentprofile', '=', profileId)
        .where('_deleted', '=', false)
        .forUpdate('Transfer_Payment_Outcome')
        .executeTakeFirst()
      if (!lockedOutcome) {
        return await notFound(event, 'TRANSFER_PAYMENT_OUTCOME_NOT_FOUND', 'apiErrors.transfer_payment.outcome_not_found')
      }

      const activeAgreementActivity = await trx
        .selectFrom('Funding_Case_Agreement_Outcome_Activity')
        .select('id')
        .where('egcs_fc_outcomes', '=', outcomeId)
        .where('_deleted', '=', false)
        .forUpdate()
        .executeTakeFirst()
      if (activeAgreementActivity) {
        return await throwApiError(event, {
          statusCode: 409,
          code: 'TRANSFER_PAYMENT_OUTCOME_IN_USE',
          key: 'apiErrors.transfer_payment.outcome_in_use'
        })
      }

      await trx
        .updateTable('Transfer_Payment_Outcome')
        .set({ _deleted: true })
        .where('id', '=', outcomeId)
        .where('egcs_tp_transferpaymentprofile', '=', profileId)
        .where('_deleted', '=', false)
        .execute()

      return { success: true }
    }
  )
})
