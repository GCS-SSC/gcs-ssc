import { TransferPaymentBudgetSchema } from '~~/shared/types/schemas'
import { authorizeTransferPaymentProfileResource } from '~~/server/utils/transfer-payment-route-authorization'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { executeFreshAuthorizedTransferPaymentWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'
import { sql } from 'kysely'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  if (!profileId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const access = await authorizeTransferPaymentProfileResource(event, 'create', profileId)
  if (!access) {
    return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
  }

  const validated = await readValidatedBodyI18n(event, TransferPaymentBudgetSchema)

  try {
    return await executeFreshAuthorizedTransferPaymentWrite(
      event,
      db,
      profileId,
      access.agencyId,
      'create',
      async (trx, currentContext) => {
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

        return await trx
          .insertInto('Transfer_Payment_Fiscal_Year_Budget')
          .values({
            egcs_tp_transferpaymentprofile: profileId,
            egcs_tp_fiscalyear: validated.egcs_tp_fiscalyear,
            egcs_tp_totalbudget: databaseMoneyValue(validated.egcs_tp_totalbudget),
            egcs_tp_overcommitthreshold: validated.egcs_tp_overcommitthreshold
          })
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
