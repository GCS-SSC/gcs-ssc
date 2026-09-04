import { sql } from 'kysely'
import { TransferPaymentStreamBudgetSchema } from '~~/shared/types/schemas'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'
import { addMoney, compareMoney } from '~~/shared/utils/money'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
// eslint-disable-next-line local/require-authorize -- delegated to authorizeTransferPaymentStreamResource
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const access = await authorizeTransferPaymentStreamResource(event, 'create', profileId, streamId)
  if (!access) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  const validated = await readValidatedBodyI18n(event, TransferPaymentStreamBudgetSchema)

  try {
    return await executeFreshAuthorizedTransferPaymentWrite(
      event,
      db,
      profileId,
      access.agencyId,
      'create',
      async trx => {
        const stream = await trx.selectFrom('Transfer_Payment_Stream')
          .select('id')
          .where('id', '=', streamId)
          .where('egcs_tp_transferpaymentprofile', '=', profileId)
          .where('_deleted', '=', false)
          .forUpdate('Transfer_Payment_Stream')
          .executeTakeFirst()
        if (!stream) {
          return await badRequest(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
        }

        const budget = await trx
          .selectFrom('Transfer_Payment_Fiscal_Year_Budget')
          .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear')
          .where('Transfer_Payment_Fiscal_Year_Budget.id', '=', validated.egcs_tp_transferpaymentbudget)
          .where('Transfer_Payment_Fiscal_Year_Budget.egcs_tp_transferpaymentprofile', '=', profileId)
          .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
          .where('Agency_Fiscal_Year._deleted', '=', false)
          .select([
            'Transfer_Payment_Fiscal_Year_Budget.id as id',
            'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear as fiscal_year_id',
            databaseMoneyText(sql.ref('Transfer_Payment_Fiscal_Year_Budget.egcs_tp_totalbudget')).as('total_budget')
          ])
          .forUpdate('Transfer_Payment_Fiscal_Year_Budget')
          .executeTakeFirst()

        if (!budget) {
          return await badRequest(event, 'TRANSFER_PAYMENT_BUDGET_NOT_FOUND', 'apiErrors.transfer_payment.budget_not_found')
        }

        const sumResult = await trx
          .selectFrom('Transfer_Payment_Stream_Budget')
          .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream')
          .innerJoin('Transfer_Payment_Fiscal_Year_Budget', 'Transfer_Payment_Fiscal_Year_Budget.id', 'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget')
          .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
          .where('Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear', '=', budget.fiscal_year_id)
          .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
          .where('Transfer_Payment_Stream._deleted', '=', false)
          .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
          .select(databaseMoneyText(sql`COALESCE(SUM(${sql.ref('Transfer_Payment_Stream_Budget.egcs_tp_totalbudget')}), 0)`).as('total'))
          .executeTakeFirst()

        if (compareMoney(
          addMoney(parseDatabaseMoney(sumResult?.total), validated.egcs_tp_totalbudget),
          parseDatabaseMoney(budget.total_budget)
        ) > 0) {
          return await badRequest(event, 'TRANSFER_PAYMENT_STREAM_BUDGET_EXCEEDS_PROGRAM_BUDGET', 'apiErrors.transfer_payment.stream_budget_exceeds_program_budget')
        }

        return await trx.insertInto('Transfer_Payment_Stream_Budget').values({
          egcs_tp_transferpaymentstream: streamId,
          egcs_tp_totalbudget: databaseMoneyValue(validated.egcs_tp_totalbudget),
          egcs_tp_transferpaymentbudget: validated.egcs_tp_transferpaymentbudget,
          egcs_tp_overcommitthreshold: validated.egcs_tp_overcommitthreshold
        }).returning([
          'id', 'egcs_tp_transferpaymentstream', 'egcs_tp_transferpaymentbudget',
          databaseMoneyText(sql.ref('egcs_tp_totalbudget')).as('egcs_tp_totalbudget'),
          'egcs_tp_overcommitthreshold'
        ]).executeTakeFirstOrThrow()
          .then(row => ({ ...row, egcs_tp_totalbudget: parseDatabaseMoney(row.egcs_tp_totalbudget) }))
      }
    )
  } catch (error) {
    return await throwIfTransferPaymentUniqueConstraintError(event, error)
  }
})
