import { authorizeTransferPaymentBudgetResource } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentWrite } from '~~/server/utils/transfer-payment-write-transaction'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
// eslint-disable-next-line local/require-authorize -- delegated to authorizeTransferPaymentBudgetResource
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const budgetId = getRouterParam(event, 'budgetId')
  if (!profileId || !budgetId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const access = await authorizeTransferPaymentBudgetResource(event, 'delete', profileId, budgetId)
  if (!access || 'missing' in access) {
    return await notFound(event, 'TRANSFER_PAYMENT_BUDGET_NOT_FOUND', 'apiErrors.transfer_payment.budget_not_found')
  }

  return await executeFreshAuthorizedTransferPaymentWrite(
    event,
    db,
    profileId,
    access.agencyId,
    'delete',
    async trx => {
      const lockedBudget = await trx
        .selectFrom('Transfer_Payment_Fiscal_Year_Budget')
        .select('id')
        .where('id', '=', budgetId)
        .where('egcs_tp_transferpaymentprofile', '=', profileId)
        .where('_deleted', '=', false)
        .forUpdate('Transfer_Payment_Fiscal_Year_Budget')
        .executeTakeFirst()
      if (!lockedBudget) {
        return await notFound(event, 'TRANSFER_PAYMENT_BUDGET_NOT_FOUND', 'apiErrors.transfer_payment.budget_not_found')
      }

      const activeAllocation = await trx.selectFrom('Transfer_Payment_Stream_Budget')
        .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream')
        .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget', '=', budgetId)
        .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
        .where('Transfer_Payment_Stream._deleted', '=', false)
        .select('Transfer_Payment_Stream_Budget.id')
        .limit(1)
        .executeTakeFirst()
      if (activeAllocation) {
        return await badRequest(
          event,
          'TRANSFER_PAYMENT_BUDGET_IN_USE_BY_STREAM',
          'apiErrors.transfer_payment.budget_in_use_by_stream'
        )
      }

      await trx
        .updateTable('Transfer_Payment_Fiscal_Year_Budget')
        .set({ _deleted: true })
        .where('id', '=', budgetId)
        .where('egcs_tp_transferpaymentprofile', '=', profileId)
        .where('_deleted', '=', false)
        .execute()

      return { success: true }
    }
  )
})
