import { sql } from 'kysely'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertAgreementExists } from '~~/server/utils/agreement-child-resources'
import { budgetFiscalYearStableId, budgetLineItemStableId } from '~~/server/utils/agreement-budget-lineage'
import { buildAgreementFinancialSummary, type SummaryBudgetLine, type SummaryClaimLine, type SummaryFiscalYear, type SummaryForecast, type SummaryForecastLine, type SummaryPayment, type SummaryReconciliation } from '~~/server/utils/agreement-financial-summary'
import { withBusinessRecordState } from '~~/server/utils/business-record-state'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { readEffectiveAccountReceivableClaimRecoveries, getAgreementPaidAccountingProjection } from '~~/server/utils/agreement-accounting-projection'

/** Agreement-wide financial view, using a single authorized read snapshot. */
export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')

  return await executeFreshReadSnapshot(event, async db => {
    const context = await authorizeAgreementResource(event, 'read', agreementId, db, { freshAuth: true })
    if (!context) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    const agreement = await assertAgreementExists(event, agreementId, db)
    if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) return agreement

    const [yearRows, budgetRows, forecastRows, forecastLineRows, claimRows, reconcileRows, paymentRows] = await Promise.all([
      db.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
        .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
        .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
        .select([
          budgetFiscalYearStableId.as('id'),
          'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as label',
          'Agency_Fiscal_Year.egcs_ay_fiscalyear as order'
        ])
        .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
        .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
        .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
        .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
        .where('Agency_Fiscal_Year.egcs_ay_organizationagency', '=', context.agencyId)
        .where('Agency_Fiscal_Year._deleted', '=', false).execute(),
      db.selectFrom('Funding_Case_Agreement_Budget_Line_Item')
        .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year', 'Funding_Case_Agreement_Budget_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear')
        .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
        .innerJoin('Transfer_Payment_Stream_Cost_Category_Line_Item', 'Transfer_Payment_Stream_Cost_Category_Line_Item.id', 'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_organizationcostcategory')
        .innerJoin('Agency_Cost_Category_Line_Item', 'Agency_Cost_Category_Line_Item.id', 'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_organizationcostcategory')
        .innerJoin('Agency_Cost_Category', 'Agency_Cost_Category.id', 'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory')
        .select([
          budgetLineItemStableId.as('id'), budgetFiscalYearStableId.as('fiscalYearId'),
          'Agency_Cost_Category.egcs_ay_name_en as categoryNameEn',
          'Agency_Cost_Category.egcs_ay_name_fr as categoryNameFr',
          'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_costsubsection as costSubsection',
          'Agency_Cost_Category_Line_Item.egcs_ay_name_en as nameEn',
          'Agency_Cost_Category_Line_Item.egcs_ay_name_fr as nameFr',
          'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_description as description',
          databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_totalamount')).as('budget'),
          'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_currency as currency'
        ])
        .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
        .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
        .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
        .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
        .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
        .where('Transfer_Payment_Stream_Cost_Category_Line_Item._deleted', '=', false)
        .where('Agency_Cost_Category_Line_Item._deleted', '=', false)
        .where('Agency_Cost_Category._deleted', '=', false)
        .orderBy('Agency_Cost_Category.egcs_ay_name_en', 'asc')
        .orderBy('Agency_Cost_Category_Line_Item.egcs_ay_name_en', 'asc').execute(),
      db.selectFrom('Funding_Case_Agreement_Forecast')
        .leftJoin('Funding_Case_Agreement_Budget_Fiscal_Year as Source_Budget_Year', join => join
          .onRef('Source_Budget_Year.id', '=', 'Funding_Case_Agreement_Forecast.egcs_fc_fiscalyear')
          .on('Source_Budget_Year.egcs_fc_fundingagreement', '=', agreementId))
        .select([
          'Funding_Case_Agreement_Forecast.id as id',
          sql<string>`COALESCE(${sql.ref('Source_Budget_Year.egcs_fc_originalbudgetfiscalyear')}, ${sql.ref('Source_Budget_Year.id')}, ${sql.ref('Funding_Case_Agreement_Forecast.egcs_fc_fiscalyear')})`.as('fiscalYearId'),
          'Funding_Case_Agreement_Forecast.egcs_fc_active as active'
        ])
        .where('Funding_Case_Agreement_Forecast.egcs_fc_fundingagreement', '=', agreementId)
        .where('Funding_Case_Agreement_Forecast.egcs_fc_active', '=', true)
        .where('Funding_Case_Agreement_Forecast._deleted', '=', false).execute(),
      db.selectFrom('Funding_Case_Agreement_Forecast_Line_Item')
        .innerJoin('Funding_Case_Agreement_Forecast', 'Funding_Case_Agreement_Forecast.id', 'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_agreementforecast')
        .leftJoin('Funding_Case_Agreement_Budget_Fiscal_Year as Source_Budget_Year', join => join
          .onRef('Source_Budget_Year.id', '=', 'Funding_Case_Agreement_Forecast.egcs_fc_fiscalyear')
          .on('Source_Budget_Year.egcs_fc_fundingagreement', '=', agreementId))
        .leftJoin('Funding_Case_Agreement_Budget_Line_Item as Source_Budget_Line', join => join
          .onRef('Source_Budget_Line.id', '=', 'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_fundingagreementbudgetlineitem')
          .on('Source_Budget_Line.egcs_fc_fundingagreement', '=', agreementId))
        .select([
          'Funding_Case_Agreement_Forecast_Line_Item.id as id',
          'Funding_Case_Agreement_Forecast.id as forecastId',
          sql<string>`COALESCE(${sql.ref('Source_Budget_Year.egcs_fc_originalbudgetfiscalyear')}, ${sql.ref('Source_Budget_Year.id')}, ${sql.ref('Funding_Case_Agreement_Forecast.egcs_fc_fiscalyear')})`.as('fiscalYearId'),
          sql<string>`COALESCE(${sql.ref('Source_Budget_Line.egcs_fc_originalbudgetlineitem')}, ${sql.ref('Source_Budget_Line.id')}, ${sql.ref('Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_fundingagreementbudgetlineitem')})`.as('budgetLineId'),
          'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_month as month',
          'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_version as version',
          'Source_Budget_Line.egcs_fc_description as description',
          databaseMoneyText(sql.ref('Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_amount')).as('amount'),
          'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_currency as currency'
        ])
        .where('Funding_Case_Agreement_Forecast.egcs_fc_fundingagreement', '=', agreementId)
        .where('Funding_Case_Agreement_Forecast.egcs_fc_active', '=', true)
        .where('Funding_Case_Agreement_Forecast_Line_Item._deleted', '=', false)
        .where('Funding_Case_Agreement_Forecast._deleted', '=', false).execute(),
      db.selectFrom('Funding_Case_Agreement_Claim_Line_Item')
        .innerJoin('Funding_Case_Agreement_Claim', 'Funding_Case_Agreement_Claim.id', 'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementclaim')
        .leftJoin('Funding_Case_Agreement_Budget_Fiscal_Year as Source_Budget_Year', join => join
          .onRef('Source_Budget_Year.id', '=', 'Funding_Case_Agreement_Claim.egcs_fc_fiscalyear')
          .on('Source_Budget_Year.egcs_fc_fundingagreement', '=', agreementId))
        .leftJoin('Funding_Case_Agreement_Budget_Line_Item as Source_Budget_Line', join => join
          .onRef('Source_Budget_Line.id', '=', 'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementbudgetlineitem')
          .on('Source_Budget_Line.egcs_fc_fundingagreement', '=', agreementId))
        .select([
          'Funding_Case_Agreement_Claim_Line_Item.id as id', 'Funding_Case_Agreement_Claim.id as claimId',
          sql<string>`COALESCE(${sql.ref('Source_Budget_Year.egcs_fc_originalbudgetfiscalyear')}, ${sql.ref('Source_Budget_Year.id')}, ${sql.ref('Funding_Case_Agreement_Claim.egcs_fc_fiscalyear')})`.as('fiscalYearId'),
          'Funding_Case_Agreement_Claim.egcs_fc_periodstart as periodStart',
          'Funding_Case_Agreement_Claim.egcs_fc_periodend as periodEnd',
          sql<string | null>`COALESCE(${sql.ref('Source_Budget_Line.egcs_fc_originalbudgetlineitem')}, ${sql.ref('Source_Budget_Line.id')}, ${sql.ref('Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementbudgetlineitem')})`.as('budgetLineId'),
          'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_description as description',
          databaseMoneyText(sql.ref('Funding_Case_Agreement_Claim_Line_Item.egcs_fc_amount')).as('amount'),
          'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_currency as currency'
        ])
        .where('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement', '=', agreementId)
        .where('Funding_Case_Agreement_Claim_Line_Item._deleted', '=', false)
        .where('Funding_Case_Agreement_Claim._deleted', '=', false).execute(),
      db.selectFrom('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
        .innerJoin('Funding_Case_Agreement_Claim_Reconcile', 'Funding_Case_Agreement_Claim_Reconcile.id', 'Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_fundingagreementclaimreconcile')
        .innerJoin('Funding_Case_Agreement_Claim', 'Funding_Case_Agreement_Claim.id', 'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim')
        .select([
          'Funding_Case_Agreement_Claim_Reconcile.id as reconcileId',
          'Funding_Case_Agreement_Claim_Reconcile_Line_Item.id as id',
          'Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_lineitem as claimLineId',
          databaseMoneyText(sql.ref('Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_reconciled')).as('amount')
        ])
        .where('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement', '=', agreementId)
        .where('Funding_Case_Agreement_Claim_Reconcile_Line_Item._deleted', '=', false)
        .where('Funding_Case_Agreement_Claim_Reconcile._deleted', '=', false)
        .where('Funding_Case_Agreement_Claim._deleted', '=', false).execute(),
      db.selectFrom('Funding_Case_Agreement_Payment')
        .innerJoin('Common_Status', 'Common_Status.id', 'Funding_Case_Agreement_Payment.egcs_fc_status')
        .leftJoin('Funding_Case_Agreement_Budget_Fiscal_Year as Source_Budget_Year', join => join
          .onRef('Source_Budget_Year.id', '=', 'Funding_Case_Agreement_Payment.egcs_fc_fiscalyear')
          .on('Source_Budget_Year.egcs_fc_fundingagreement', '=', agreementId))
        .select([
          'Funding_Case_Agreement_Payment.id as id',
          sql<string>`COALESCE(${sql.ref('Source_Budget_Year.egcs_fc_originalbudgetfiscalyear')}, ${sql.ref('Source_Budget_Year.id')}, ${sql.ref('Funding_Case_Agreement_Payment.egcs_fc_fiscalyear')})`.as('fiscalYearId'),
          'Funding_Case_Agreement_Payment.egcs_fc_periodstart as periodStart',
          'Funding_Case_Agreement_Payment.egcs_fc_periodend as periodEnd',
          databaseMoneyText(sql.ref('Funding_Case_Agreement_Payment.egcs_fc_paymentamount')).as('amount'),
          'Funding_Case_Agreement_Payment.egcs_fc_currency as currency',
          'Common_Status.egcs_cn_terminal as terminal'
        ])
        .where('Funding_Case_Agreement_Payment.egcs_fc_fundingagreement', '=', agreementId)
        .where('Funding_Case_Agreement_Payment._deleted', '=', false)
        .where('Common_Status._deleted', '=', false).execute()
    ])

    const reconcileIds = [...new Set(reconcileRows.map(row => String(row.reconcileId)))]
    const states = await withBusinessRecordState(db, 'fundingclaimreconcile', reconcileIds.map(id => ({ id })))
    const positiveIds = new Set(states.filter(state => state.lifecycleTerminus === 'positive').map(state => String(state.id)))

    const years: SummaryFiscalYear[] = yearRows.map(row => ({ id: String(row.id), label: row.label, order: String(row.order) }))
    const budgets: SummaryBudgetLine[] = budgetRows.map(row => ({ ...row, id: String(row.id), fiscalYearId: String(row.fiscalYearId), budget: parseDatabaseMoney(row.budget) }))
    const forecasts: SummaryForecast[] = forecastRows.map(row => ({ id: String(row.id), fiscalYearId: String(row.fiscalYearId), active: row.active }))
    const forecastLines: SummaryForecastLine[] = forecastLineRows.map(row => ({ ...row, id: String(row.id), forecastId: String(row.forecastId), fiscalYearId: String(row.fiscalYearId), budgetLineId: String(row.budgetLineId), version: String(row.version), amount: parseDatabaseMoney(row.amount) }))
    const claims: SummaryClaimLine[] = claimRows.map(row => ({ ...row, id: String(row.id), claimId: String(row.claimId), fiscalYearId: String(row.fiscalYearId), budgetLineId: row.budgetLineId == null ? null : String(row.budgetLineId), amount: parseDatabaseMoney(row.amount) }))
    const reconciliations: SummaryReconciliation[] = reconcileRows.map(row => ({ id: String(row.id), claimLineId: String(row.claimLineId), amount: parseDatabaseMoney(row.amount), positive: positiveIds.has(String(row.reconcileId)) }))
    const payments: SummaryPayment[] = paymentRows.map(row => ({ ...row, id: String(row.id), fiscalYearId: String(row.fiscalYearId), amount: parseDatabaseMoney(row.amount) }))
    const accounting = await getAgreementPaidAccountingProjection(db, agreementId, { paymentMode: 'finalized' })
    for (const entry of accounting.entries) {
      if (!years.some(year => year.id === entry.fiscalYearId)) years.push({
        id: entry.fiscalYearId, label: entry.fiscalYearLabel, order: entry.fiscalYearOrder
      })
    }
    const finalizedIds = new Set(accounting.entries.filter(entry => entry.kind === 'cash_payment').map(entry => entry.id))
    return buildAgreementFinancialSummary(years, budgets, forecasts, forecastLines, claims, reconciliations,
      payments.filter(payment => finalizedIds.has(payment.id)), accounting.entries.flatMap(entry =>
        entry.kind === 'cash_payment' ? [] : [{ ...entry, kind: entry.kind }]), await readEffectiveAccountReceivableClaimRecoveries(db, agreementId))
  })
})
