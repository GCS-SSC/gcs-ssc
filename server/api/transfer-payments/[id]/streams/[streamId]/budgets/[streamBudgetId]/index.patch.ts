import { sql } from 'kysely'
import { TransferPaymentStreamBudgetSchema } from '~~/shared/types/schemas'
import { authorizeTransferPaymentStreamBudgetResource } from '~~/server/utils/transfer-payment-route-authorization'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { executeFreshAuthorizedTransferPaymentWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'
import { addMoney, compareMoney } from '~~/shared/utils/money'

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

  const access = await authorizeTransferPaymentStreamBudgetResource(event, 'update', profileId, streamId, streamBudgetId)
  if (!access) {
    return await notFound(
      event,
      'TRANSFER_PAYMENT_STREAM_BUDGET_NOT_FOUND',
      'apiErrors.transfer_payment.stream_budget_not_found'
    )
  }

  const validated = await readValidatedBodyI18n(event, TransferPaymentStreamBudgetSchema.partial())
  if (Object.keys(validated).length === 0) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }

  try {
    return await executeFreshAuthorizedTransferPaymentWrite(
      event,
      db,
      profileId,
      access.agencyId,
      'update',
      async trx => {
        const lockedStreamBudget = await trx.selectFrom('Transfer_Payment_Stream_Budget')
          .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream')
          .where('Transfer_Payment_Stream_Budget.id', '=', streamBudgetId)
          .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream', '=', streamId)
          .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
          .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
          .where('Transfer_Payment_Stream._deleted', '=', false)
          .select([
            'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget as budget_id',
            databaseMoneyText(sql.ref('Transfer_Payment_Stream_Budget.egcs_tp_totalbudget')).as('total_budget')
          ])
          .forUpdate('Transfer_Payment_Stream_Budget')
          .executeTakeFirst()
        if (!lockedStreamBudget) {
          return await notFound(event, 'TRANSFER_PAYMENT_STREAM_BUDGET_NOT_FOUND', 'apiErrors.transfer_payment.stream_budget_not_found')
        }

        const targetBudgetId = String(validated.egcs_tp_transferpaymentbudget ?? lockedStreamBudget.budget_id)
        const targetTotalBudget = validated.egcs_tp_totalbudget ?? parseDatabaseMoney(lockedStreamBudget.total_budget)
        const budgetIds = [...new Set([String(lockedStreamBudget.budget_id), targetBudgetId])].sort()
        const budgets = await trx.selectFrom('Transfer_Payment_Fiscal_Year_Budget')
          .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear')
          .where('Transfer_Payment_Fiscal_Year_Budget.id', 'in', budgetIds)
          .where('Transfer_Payment_Fiscal_Year_Budget.egcs_tp_transferpaymentprofile', '=', profileId)
          .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
          .where('Agency_Fiscal_Year._deleted', '=', false)
          .select([
            'Transfer_Payment_Fiscal_Year_Budget.id as id',
            'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear as fiscal_year_id',
            databaseMoneyText(sql.ref('Transfer_Payment_Fiscal_Year_Budget.egcs_tp_totalbudget')).as('total_budget')
          ])
          .orderBy('Transfer_Payment_Fiscal_Year_Budget.id', 'asc')
          .forUpdate('Transfer_Payment_Fiscal_Year_Budget')
          .execute()
        const budget = budgets.find(candidate => String(candidate.id) === targetBudgetId)
        if (!budget) {
          return await badRequest(event, 'TRANSFER_PAYMENT_BUDGET_NOT_FOUND', 'apiErrors.transfer_payment.budget_not_found')
        }

        const sumResult = await trx.selectFrom('Transfer_Payment_Stream_Budget')
          .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream')
          .innerJoin('Transfer_Payment_Fiscal_Year_Budget', 'Transfer_Payment_Fiscal_Year_Budget.id', 'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget')
          .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
          .where('Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear', '=', budget.fiscal_year_id)
          .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
          .where('Transfer_Payment_Stream._deleted', '=', false)
          .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
          .where('Transfer_Payment_Stream_Budget.id', '!=', streamBudgetId)
          .select(databaseMoneyText(sql`COALESCE(SUM(${sql.ref('Transfer_Payment_Stream_Budget.egcs_tp_totalbudget')}), 0)`).as('total'))
          .executeTakeFirst()
        if (compareMoney(
          addMoney(parseDatabaseMoney(sumResult?.total), targetTotalBudget),
          parseDatabaseMoney(budget.total_budget)
        ) > 0) {
          return await badRequest(event, 'TRANSFER_PAYMENT_STREAM_BUDGET_EXCEEDS_PROGRAM_BUDGET', 'apiErrors.transfer_payment.stream_budget_exceeds_program_budget')
        }

        const { egcs_tp_totalbudget, ...nonMoneyValues } = validated
        return await trx.updateTable('Transfer_Payment_Stream_Budget')
          .set({
            ...nonMoneyValues,
            ...(egcs_tp_totalbudget === undefined ? {} : { egcs_tp_totalbudget: databaseMoneyValue(egcs_tp_totalbudget) })
          })
          .where('id', '=', streamBudgetId)
          .where('_deleted', '=', false)
          .returning([
            'id', 'egcs_tp_transferpaymentstream', 'egcs_tp_transferpaymentbudget',
            databaseMoneyText(sql.ref('egcs_tp_totalbudget')).as('egcs_tp_totalbudget'),
            'egcs_tp_overcommitthreshold'
          ])
          .executeTakeFirstOrThrow()
          .then(row => ({ ...row, egcs_tp_totalbudget: parseDatabaseMoney(row.egcs_tp_totalbudget) }))
      }
    )
  } catch (error) {
    return await throwIfTransferPaymentUniqueConstraintError(event, error)
  }
})
