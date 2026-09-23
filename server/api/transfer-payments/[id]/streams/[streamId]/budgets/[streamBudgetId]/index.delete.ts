import { authorizeTransferPaymentStreamBudgetResource } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
// eslint-disable-next-line local/require-authorize -- delegated to authorizeTransferPaymentStreamBudgetResource
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const streamBudgetId = getRouterParam(event, 'streamBudgetId')
  if (!profileId || !streamId || !streamBudgetId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const access = await authorizeTransferPaymentStreamBudgetResource(event, 'delete', profileId, streamId, streamBudgetId)
  if (!access) {
    return await notFound(
      event,
      'TRANSFER_PAYMENT_STREAM_BUDGET_NOT_FOUND',
      'apiErrors.transfer_payment.stream_budget_not_found'
    )
  }

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event,
    db,
    profileId,
    access.agencyId,
    streamId,
    'delete',
    async trx => {
      const budget = await trx.selectFrom('Transfer_Payment_Stream_Budget')
        .innerJoin('Transfer_Payment_Fiscal_Year_Budget', 'Transfer_Payment_Fiscal_Year_Budget.id', 'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget')
        .where('Transfer_Payment_Stream_Budget.id', '=', streamBudgetId)
        .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream', '=', streamId)
        .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
        .select('Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear')
        .forUpdate('Transfer_Payment_Stream_Budget').executeTakeFirst()
      if (!budget) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_BUDGET_NOT_FOUND', 'apiErrors.transfer_payment.stream_budget_not_found')
      const otherBudget = await trx.selectFrom('Transfer_Payment_Stream_Budget')
        .innerJoin('Transfer_Payment_Fiscal_Year_Budget', 'Transfer_Payment_Fiscal_Year_Budget.id', 'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget')
        .where('Transfer_Payment_Stream_Budget.id', '!=', streamBudgetId)
        .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream', '=', streamId)
        .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
        .where('Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear', '=', budget.egcs_tp_fiscalyear)
        .select('Transfer_Payment_Stream_Budget.id').forUpdate('Transfer_Payment_Stream_Budget').executeTakeFirst()
      if (!otherBudget) {
        const reference = await trx.selectFrom('Transfer_Payment_Stream_Chart_of_Account')
          .innerJoin('Agency_Chart_of_Account', 'Agency_Chart_of_Account.id', 'Transfer_Payment_Stream_Chart_of_Account.egcs_tp_agencychartofaccount')
          .where('Agency_Chart_of_Account.egcs_ay_fiscalyear', '=', budget.egcs_tp_fiscalyear)
          .where('Transfer_Payment_Stream_Chart_of_Account.egcs_tp_transferpaymentstream', '=', streamId)
          .where('Transfer_Payment_Stream_Chart_of_Account._deleted', '=', false)
          .select('Transfer_Payment_Stream_Chart_of_Account.id').forUpdate('Transfer_Payment_Stream_Chart_of_Account').executeTakeFirst()
        if (reference) return await badRequest(event, 'TRANSFER_PAYMENT_STREAM_BUDGET_IN_USE', 'apiErrors.transfer_payment.stream_budget_in_use')
      }
      const deleted = await trx.updateTable('Transfer_Payment_Stream_Budget')
        .set({ _deleted: true })
        .where('id', '=', streamBudgetId)
        .where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false)
        .returning('id')
        .executeTakeFirst()
      if (!deleted) {
        return await notFound(event, 'TRANSFER_PAYMENT_STREAM_BUDGET_NOT_FOUND', 'apiErrors.transfer_payment.stream_budget_not_found')
      }
      return { success: true }
    }
  )
})
