import { TransferPaymentBudgetSchema } from '~~/shared/types/schemas'
import { authorizeTransferPaymentBudgetResource } from '~~/server/utils/transfer-payment-route-authorization'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { executeFreshAuthorizedTransferPaymentWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { sql } from 'kysely'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'
import { compareMoney } from '~~/shared/utils/money'

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

  const access = await authorizeTransferPaymentBudgetResource(event, 'update', profileId, budgetId)
  if (!access || 'missing' in access) {
    return await notFound(event, 'TRANSFER_PAYMENT_BUDGET_NOT_FOUND', 'apiErrors.transfer_payment.budget_not_found')
  }

  const validated = await readValidatedBodyI18n(event, TransferPaymentBudgetSchema.partial())
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
      async (trx, currentContext) => {
        const lockedBudget = await trx
          .selectFrom('Transfer_Payment_Fiscal_Year_Budget')
          .select(['id', databaseMoneyText(sql.ref('egcs_tp_totalbudget')).as('egcs_tp_totalbudget')])
          .where('id', '=', budgetId)
          .where('egcs_tp_transferpaymentprofile', '=', profileId)
          .where('_deleted', '=', false)
          .forUpdate('Transfer_Payment_Fiscal_Year_Budget')
          .executeTakeFirst()
        if (!lockedBudget) {
          return await notFound(event, 'TRANSFER_PAYMENT_BUDGET_NOT_FOUND', 'apiErrors.transfer_payment.budget_not_found')
        }

        const nextTotalBudget = validated.egcs_tp_totalbudget ?? parseDatabaseMoney(lockedBudget.egcs_tp_totalbudget)
        const allocated = await trx.selectFrom('Transfer_Payment_Stream_Budget')
          .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream')
          .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget', '=', budgetId)
          .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
          .where('Transfer_Payment_Stream._deleted', '=', false)
          .select(databaseMoneyText(sql`COALESCE(SUM(${sql.ref('Transfer_Payment_Stream_Budget.egcs_tp_totalbudget')}), 0)`).as('total'))
          .executeTakeFirst()
        if (compareMoney(parseDatabaseMoney(allocated?.total), nextTotalBudget) > 0) {
          return await badRequest(
            event,
            'TRANSFER_PAYMENT_STREAM_BUDGET_EXCEEDS_PROGRAM_BUDGET',
            'apiErrors.transfer_payment.stream_budget_exceeds_program_budget'
          )
        }

        if (validated.egcs_tp_fiscalyear) {
          const fiscalYear = await trx
            .selectFrom('Agency_Fiscal_Year')
            .where('id', '=', validated.egcs_tp_fiscalyear)
            .where('egcs_ay_organizationagency', '=', currentContext.agencyId)
            .where('_deleted', '=', false)
            .select('id')
            .forShare('Agency_Fiscal_Year')
            .executeTakeFirst()

          if (!fiscalYear) {
            return await badRequest(event, 'INVALID_FISCAL_YEAR', 'apiErrors.transfer_payment.invalid_fiscal_year')
          }
        }

        const { egcs_tp_totalbudget, ...nonMoneyValues } = validated
        return await trx
          .updateTable('Transfer_Payment_Fiscal_Year_Budget')
          .set({
            ...nonMoneyValues,
            ...(egcs_tp_totalbudget === undefined ? {} : { egcs_tp_totalbudget: databaseMoneyValue(egcs_tp_totalbudget) })
          })
          .where('id', '=', budgetId)
          .where('egcs_tp_transferpaymentprofile', '=', profileId)
          .where('_deleted', '=', false)
          .returning([
            'id', 'egcs_tp_transferpaymentprofile', 'egcs_tp_fiscalyear',
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
