import { authorizeTransferPaymentBudgetResource } from '~~/server/utils/transfer-payment-route-authorization'
import { sql } from 'kysely'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'

// eslint-disable-next-line local/require-authorize -- delegated to authorizeTransferPaymentBudgetResource
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const budgetId = getRouterParam(event, 'budgetId')
  if (!profileId || !budgetId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const access = await authorizeTransferPaymentBudgetResource(event, 'read', profileId, budgetId)
  if (!access || 'missing' in access) {
    if (!access) return await notFound(event, 'TRANSFER_PAYMENT_BUDGET_NOT_FOUND', 'apiErrors.transfer_payment.budget_not_found')
    return access.missing === 'profile'
      ? await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
      : await notFound(event, 'TRANSFER_PAYMENT_BUDGET_NOT_FOUND', 'apiErrors.transfer_payment.budget_not_found')
  }
  const agencyId = access.agencyId
  const resolvedProfileId = profileId

  const budget = await db
    .selectFrom('Transfer_Payment_Fiscal_Year_Budget')
    .innerJoin(
      'Agency_Fiscal_Year',
      'Agency_Fiscal_Year.id',
      'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear'
    )
    .innerJoin(
      'Transfer_Payment_Profile',
      'Transfer_Payment_Profile.id',
      'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_transferpaymentprofile'
    )
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .where('Transfer_Payment_Fiscal_Year_Budget.id', '=', budgetId)
    .where(
      'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_transferpaymentprofile',
      '=',
      resolvedProfileId
    )
    .where('Transfer_Payment_Profile.egcs_tp_agency', '=', agencyId)
    .where('Agency_Fiscal_Year.egcs_ay_organizationagency', '=', agencyId)
    .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
    .where('Agency_Fiscal_Year._deleted', '=', false)
    .select([
      'Transfer_Payment_Fiscal_Year_Budget.id as id',
      'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_transferpaymentprofile as egcs_tp_transferpaymentprofile',
      'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear as egcs_tp_fiscalyear',
      databaseMoneyText(sql.ref('Transfer_Payment_Fiscal_Year_Budget.egcs_tp_totalbudget')).as('egcs_tp_totalbudget'),
      'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_overcommitthreshold as egcs_tp_overcommitthreshold',
      'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display',
      'Agency_Fiscal_Year.egcs_ay_fiscalyear as fiscal_year'
    ])
    .executeTakeFirst()

  if (!budget) {
    return await notFound(event, 'TRANSFER_PAYMENT_BUDGET_NOT_FOUND', 'apiErrors.transfer_payment.budget_not_found')
  }

  return {
    ...budget,
    id: String(budget.id),
    egcs_tp_transferpaymentprofile: String(budget.egcs_tp_transferpaymentprofile),
    egcs_tp_fiscalyear: String(budget.egcs_tp_fiscalyear),
    egcs_tp_totalbudget: parseDatabaseMoney(budget.egcs_tp_totalbudget)
  }
})
