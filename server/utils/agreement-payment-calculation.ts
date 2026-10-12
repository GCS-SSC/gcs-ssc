/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Internal financial readers share the documented calculation entry point. */
import { sql, type Kysely, type Transaction } from 'kysely'
import type { GcsExtensionAgreementFinancials, GcsExtensionPaymentCalculationInput, GcsExtensionPaymentCalculationResult } from '@gcs-ssc/extensions/server'
import type { Currency_Codes, Database } from '~~/shared/types/database'
import { CURRENCY_CODES_ENUM } from '~~/shared/constants/enums'
import { parseMoneyText } from '~~/shared/utils/money'
import { buildAgreementPaymentFinancialInputs, type PaymentPeriodPosition, type PaymentPeriodAmount, type PaymentReconciledPeriod, type PaymentCreditMemoSource } from './agreement-payment-policies'
import { databaseMoneyText, parseDatabaseMoney } from './database-money'

type Db = Kysely<Database> | Transaction<Database>
type AgreementPaymentHoldbackSettings = { holdbackPercent: string, holdbackBasis: 'fullagreement' | 'finalfiscal' }
const stableBudgetFiscalYearId = sql<string>`COALESCE(
  "Funding_Case_Agreement_Budget_Fiscal_Year"."egcs_fc_originalbudgetfiscalyear",
  "Funding_Case_Agreement_Budget_Fiscal_Year"."id"
)`

/** Loads the agreement's holdback percentage and agency holdback-basis type. */
export const getAgreementHoldbackSettings = async (
  db: Db,
  agreementId: string,
  currency?: Currency_Codes
): Promise<AgreementPaymentHoldbackSettings> => {
  const row = await db
    .selectFrom('Funding_Case_Agreement_Profile')
    .innerJoin(
      'Transfer_Payment_Stream_Holdback_Basis',
      'Transfer_Payment_Stream_Holdback_Basis.id',
      'Funding_Case_Agreement_Profile.egcs_fc_holdbackbasis'
    )
    .innerJoin(
      'Agency_Holdback_Basis',
      'Agency_Holdback_Basis.id',
      'Transfer_Payment_Stream_Holdback_Basis.egcs_tp_agencyholdback'
    )
    .select([
      'Funding_Case_Agreement_Profile.egcs_fc_holdback',
      'Funding_Case_Agreement_Profile.egcs_fc_currency',
      'Agency_Holdback_Basis.egcs_ay_holdbackbasis as holdback_basis_type'
    ])
    .where('Funding_Case_Agreement_Profile.id', '=', agreementId)
    .where('Funding_Case_Agreement_Profile._deleted', '=', false)
    .where('Transfer_Payment_Stream_Holdback_Basis._deleted', '=', false)
    .where('Agency_Holdback_Basis._deleted', '=', false)
    .executeTakeFirst() as {
      egcs_fc_holdback?: unknown
      egcs_fc_currency?: unknown
      holdback_basis_type?: unknown
    } | undefined

  if (row?.holdback_basis_type !== 'fullagreement' && row?.holdback_basis_type !== 'finalfiscal') {
    throw new Error('The Agreement holdback basis is unavailable.')
  }
  if (typeof row.egcs_fc_currency !== 'string') {
    throw new Error('The Agreement currency is unavailable.')
  }
  if (currency !== undefined && row.egcs_fc_currency !== currency) {
    throw new Error('The selected currency must match the Agreement.')
  }

  return {
    holdbackPercent: String(row.egcs_fc_holdback ?? 0),
    holdbackBasis: row.holdback_basis_type
  }
}

/** Resolves a selected budget fiscal year and month into a comparable period position. */
export const getSelectedPaymentPeriod = async (
  db: Db,
  agreementId: string,
  fiscalYearId: string,
  periodEnd: number
): Promise<PaymentPeriodPosition> => {
  const row = await db
    .selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
    .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
    .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
    .select('Agency_Fiscal_Year.egcs_ay_fiscalyear as fiscal_year_order')
    .where(stableBudgetFiscalYearId, '=', fiscalYearId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .where('Agency_Fiscal_Year._deleted', '=', false)
    .executeTakeFirst() as { fiscal_year_order?: unknown } | undefined

  if (row?.fiscal_year_order === undefined || row.fiscal_year_order === null) {
    throw new Error('The selected current Agreement fiscal year is unavailable.')
  }

  return {
    fiscalYearOrder: Number(row.fiscal_year_order),
    month: periodEnd
  }
}

/** Loads reconciled claim amounts and their fiscal-period positions for an agreement. */
const getClaimRows = async (db: Db, agreementId: string, currency: Currency_Codes): Promise<Array<PaymentPeriodAmount & PaymentReconciledPeriod & { isFinal: boolean }>> => {
  const rows = await db
    .selectFrom('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
    .innerJoin('Funding_Case_Agreement_Claim_Line_Item',
      'Funding_Case_Agreement_Claim_Line_Item.id',
      'Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_lineitem')
    .innerJoin(
      'Funding_Case_Agreement_Claim_Reconcile',
      'Funding_Case_Agreement_Claim_Reconcile.id',
      'Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_fundingagreementclaimreconcile'
    )
    .innerJoin(
      'Funding_Case_Agreement_Claim',
      'Funding_Case_Agreement_Claim.id',
      'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim'
    )
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as sourceClaimYear',
      'sourceClaimYear.id', 'Funding_Case_Agreement_Claim.egcs_fc_fiscalyear')
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year', join => join.on(
      stableBudgetFiscalYearId, '=', sql<string>`COALESCE("sourceClaimYear".egcs_fc_originalbudgetfiscalyear,"sourceClaimYear".id)`
    ))
    .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
    .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
    .select([
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_reconciled')).as('amount'),
      'Funding_Case_Agreement_Claim.egcs_fc_periodend as month',
      'Funding_Case_Agreement_Claim.egcs_fc_periodstart as periodStart',
      'Funding_Case_Agreement_Claim.id as claimId',
      'Funding_Case_Agreement_Claim.egcs_fc_applicantrecipient as applicantRecipientId',
      'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_isfinal as isFinal',
      'Agency_Fiscal_Year.egcs_ay_fiscalyear as fiscal_year_order'
    ])
    .where('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement', '=', agreementId)
    .where('sourceClaimYear.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Claim_Line_Item.egcs_fc_currency', '=', currency)
    .where('Funding_Case_Agreement_Claim_Line_Item._deleted', '=', false)
    .where(sql<boolean>`EXISTS (
      SELECT 1
      FROM "Common_Completion" completion
      LEFT JOIN "Common_Workflow_Run" workflow
        ON workflow.egcs_cn_completion = completion.id
      LEFT JOIN "Common_Runtime" runtime
        ON runtime.id = workflow.id
       AND runtime._deleted = false
      WHERE completion.egcs_cn_entitytype = 'fundingclaimreconcile'
        AND completion.egcs_cn_entityid = "Funding_Case_Agreement_Claim_Reconcile".id
        AND completion._deleted = false
        AND (
          completion.egcs_cn_disposition = 'no_workflow'
          OR runtime.egcs_cn_state IN ('succeeded', 'approved')
        )
        AND (runtime.id IS NULL OR runtime.egcs_cn_attempt = (
          SELECT MAX(latest.egcs_cn_attempt)
          FROM "Common_Workflow_Run" latest_run
          JOIN "Common_Runtime" latest ON latest.id = latest_run.id
          WHERE latest_run.egcs_cn_completion = completion.id
            AND latest._deleted = false
        ))
    )`)
    .where('Funding_Case_Agreement_Claim._deleted', '=', false)
    .where('Funding_Case_Agreement_Claim_Reconcile._deleted', '=', false)
    .where('Funding_Case_Agreement_Claim_Reconcile_Line_Item._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .where('Agency_Fiscal_Year._deleted', '=', false)
    .execute()

  return rows.map(row => ({
    amount: parseDatabaseMoney(row.amount),
    month: row.month, periodStart: row.periodStart, periodEnd: row.month,
    claimId: String(row.claimId), applicantRecipientId: String(row.applicantRecipientId), isFinal: row.isFinal,
    fiscalYearOrder: Number(row.fiscal_year_order)
  }))
}

/** Loads linked posted credits and retained source periods, including approved principal adjustments. */
export const getCreditMemoSources = async (
  db: Db, agreementId: string, currency: Currency_Codes, selectedYearOrder: number
): Promise<PaymentCreditMemoSource[]> => {
  const result = await sql<Omit<PaymentCreditMemoSource, 'principal' | 'creditAmount'> & { principal: string; creditAmount: string }>`
    WITH credits AS (
      SELECT line.egcs_fc_receivable AS receivable, line.egcs_fc_amount AS amount
      FROM "Funding_Case_Account_Receivable_Credit_Memo_Line" line
      JOIN "Funding_Case_Account_Receivable_Credit_Memo" memo ON memo.id=line.egcs_fc_creditmemo
      JOIN "Funding_Case_Agreement_Account_Receivable" owner ON owner.id=line.egcs_fc_receivable
      JOIN "Agency_Chart_of_Account" account ON account.id=line.egcs_fc_commitmentchartofaccount
      JOIN "Agency_Fiscal_Year" fiscal ON fiscal.id=account.egcs_ay_fiscalyear
      WHERE memo.egcs_fc_outcome='posted' AND memo.egcs_fc_currency=${currency}
        AND owner.egcs_fc_fundingagreement=${agreementId}
        AND fiscal.egcs_ay_fiscalyear<=${selectedYearOrder} AND NOT memo._deleted AND NOT line._deleted
      UNION ALL
      SELECT memo.egcs_fc_receivable, credit_line.egcs_fc_amount
      FROM "Funding_Case_Account_Receivable_Offset_Memo" memo
      JOIN "Funding_Case_Account_Receivable_Offset_Memo_Line" credit_line ON credit_line.egcs_fc_offsetmemo=memo.id
      JOIN "Funding_Case_Agreement_Account_Receivable" owner ON owner.id=memo.egcs_fc_receivable
      JOIN "Funding_Case_Account_Receivable_Pool" pool ON pool.id=memo.egcs_fc_pool
      JOIN "Agency_Chart_of_Account" account ON account.id=credit_line.egcs_fc_commitmentchartofaccount
      JOIN "Agency_Fiscal_Year" fiscal ON fiscal.id=account.egcs_ay_fiscalyear
      JOIN "Funding_Case_Account_Receivable_Offset_Memo_Application" application ON application.egcs_fc_offsetmemo=memo.id
      JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id=application.egcs_fc_recovery
      WHERE recovery.egcs_fc_outcome='posted' AND pool.egcs_fc_currency=${currency}
        AND owner.egcs_fc_fundingagreement=${agreementId}
        AND fiscal.egcs_ay_fiscalyear<=${selectedYearOrder} AND NOT recovery._deleted AND NOT memo._deleted
    ), totals AS (
      SELECT receivable, sum(amount) AS amount FROM credits GROUP BY receivable
    )
    SELECT source.id::text AS id, debt.id::text AS "receivableId", totals.amount::text AS "creditAmount",
      debt.egcs_fc_applicantrecipient::text AS "applicantRecipientId",
      fiscal.egcs_ay_fiscalyear::integer AS "fiscalYearOrder", source.egcs_fc_claim::text AS "claimId",
      source.egcs_fc_periodstart AS "periodStart", source.egcs_fc_periodend AS "periodEnd",
      (source.egcs_fc_amount + coalesce((
        SELECT sum(delta.egcs_fc_amount) FROM "Funding_Case_Agreement_Account_Receivable_Line" delta
        JOIN "Funding_Case_Agreement_Account_Receivable" adjustment ON adjustment.id=delta.egcs_fc_receivable
        WHERE delta.egcs_fc_originalline=source.id AND adjustment.egcs_fc_linkedreceivable=debt.id
          AND adjustment.egcs_fc_outcome='posted' AND NOT adjustment._deleted AND NOT delta._deleted
      ),0))::text AS principal
    FROM totals
    JOIN "Funding_Case_Agreement_Account_Receivable" debt ON debt.id=totals.receivable
    JOIN "Funding_Case_Agreement_Account_Receivable_Line" source ON source.egcs_fc_receivable=debt.id
    JOIN "Agency_Fiscal_Year" fiscal ON fiscal.id=debt.egcs_fc_agencyfiscalyear
    WHERE debt.egcs_fc_fundingagreement=${agreementId} AND source.egcs_fc_fundingagreement=${agreementId}
      AND debt.egcs_fc_currency=${currency} AND debt.egcs_fc_outcome='posted' AND debt.egcs_fc_linkedreceivable IS NULL
      AND NOT debt._deleted AND NOT source._deleted
    ORDER BY debt.id, source.id
  `.execute(db)
  return result.rows.map(row => ({ ...row, principal: parseDatabaseMoney(row.principal), creditAmount: parseDatabaseMoney(row.creditAmount) }))
}

/** Loads active forecast line amounts and their fiscal-period positions for an agreement. */
const getForecastRows = async (db: Db, agreementId: string, currency: Currency_Codes): Promise<PaymentPeriodAmount[]> => {
  const rows = await db
    .selectFrom('Funding_Case_Agreement_Forecast_Line_Item')
    .innerJoin(
      'Funding_Case_Agreement_Forecast',
      'Funding_Case_Agreement_Forecast.id',
      'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_agreementforecast'
    )
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as sourceForecastYear',
      'sourceForecastYear.id', 'Funding_Case_Agreement_Forecast.egcs_fc_fiscalyear')
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year', join => join.on(
      stableBudgetFiscalYearId, '=', sql<string>`COALESCE("sourceForecastYear".egcs_fc_originalbudgetfiscalyear,"sourceForecastYear".id)`
    ))
    .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
    .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
    .select([
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_amount')).as('amount'),
      'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_month as month',
      'Agency_Fiscal_Year.egcs_ay_fiscalyear as fiscal_year_order'
    ])
    .where('Funding_Case_Agreement_Forecast.egcs_fc_fundingagreement', '=', agreementId)
    .where('sourceForecastYear.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_currency', '=', currency)
    .where('Funding_Case_Agreement_Forecast.egcs_fc_active', '=', true)
    .where('Funding_Case_Agreement_Forecast._deleted', '=', false)
    .where('Funding_Case_Agreement_Forecast_Line_Item._deleted', '=', false)
    .where('Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_version', '=', sql<string>`(
      SELECT MAX(latest.egcs_fc_version) FROM "Funding_Case_Agreement_Forecast_Line_Item" latest
      WHERE latest.egcs_fc_agreementforecast="Funding_Case_Agreement_Forecast".id AND NOT latest._deleted
    )`)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .where('Agency_Fiscal_Year._deleted', '=', false)
    .execute() as Array<{ amount?: unknown, month?: unknown, fiscal_year_order?: unknown }>

  return rows.map(row => ({
    amount: parseDatabaseMoney(row.amount),
    month: Number(row.month ?? 0),
    fiscalYearOrder: Number(row.fiscal_year_order ?? 0)
  }))
}

/** Loads current budget funding and the complete fiscal-year horizon for host policies. */
const getBudgetSources = async (
  db: Db,
  agreementId: string,
  currency: Currency_Codes
) => {
  const rows = await db
    .selectFrom('Funding_Case_Agreement_Budget_Line_Item')
    .innerJoin(
      'Funding_Case_Agreement_Budget_Fiscal_Year',
      'Funding_Case_Agreement_Budget_Fiscal_Year.id',
      'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear'
    )
    .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
    .innerJoin(
      'Funding_Case_Agreement_Budget_Version',
      'Funding_Case_Agreement_Budget_Version.id',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion'
    )
    .select([
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_programfunding')).as('amount'),
      'Agency_Fiscal_Year.egcs_ay_fiscalyear as fiscal_year_order'
    ])
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_currency', '=', currency)
    .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .where('Agency_Fiscal_Year._deleted', '=', false)
    .execute() as Array<{ amount?: unknown, fiscal_year_order?: unknown }>

  // The Agreement horizon includes an empty final fiscal year; funding-line presence does not shorten it.
  const fiscalYears = await db
    .selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
    .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
    .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .where('Agency_Fiscal_Year._deleted', '=', false)
    .select('Agency_Fiscal_Year.egcs_ay_fiscalyear as fiscal_year_order')
    .execute() as Array<{ fiscal_year_order: unknown }>

  const normalizedRows = rows.map(row => ({
    amount: parseDatabaseMoney(row.amount),
    fiscalYearOrder: Number(row.fiscal_year_order ?? 0)
  }))
  return {
    rows: normalizedRows,
    fiscalYearOrders: fiscalYears.map(row => Number(row.fiscal_year_order))
  }
}

/** Supplies exact financial inputs; the extension owns Payment entitlement and holdback arithmetic. */
export const getAgreementPaymentCalculation = async (
  db: Db,
  agreementId: string,
  input: GcsExtensionPaymentCalculationInput,
  agreementFinancials: Pick<GcsExtensionAgreementFinancials, 'getCommitmentPaymentCapacity' | 'getRecordedPaidToDate' | 'getClaimRecoveryProjection'>
): Promise<GcsExtensionPaymentCalculationResult> => {
  const currency = CURRENCY_CODES_ENUM.find(code => code === input.currency)
  if (!currency) throw new Error('A resolved Agreement currency is required.')
  if (!Number.isInteger(input.periodEnd) || input.periodEnd < 0 || input.periodEnd > 11) throw new Error('Payment period end must be a fiscal month from zero through eleven.')
  if (!Number.isInteger(input.periodStart) || input.periodStart < 0 || input.periodStart > input.periodEnd) throw new Error('Payment period start must be a fiscal month no later than period end.')
  const holdbackSettings = await getAgreementHoldbackSettings(db, agreementId, currency)
  const selectedPosition = await getSelectedPaymentPeriod(db, agreementId, input.fiscalYearId, input.periodEnd)
  const [
    reconciliations,
    claimRecoveries,
    forecastRows,
    commitmentRemaining,
    budgetSources,
    recordedPaid,
    creditMemoSources
  ] = await Promise.all([
    getClaimRows(db, agreementId, currency),
    agreementFinancials.getClaimRecoveryProjection().then(recoveries => recoveries.entries.filter(row => row.currency === currency).map(row => ({
      amount: parseMoneyText(row.amount), month: row.month, fiscalYearOrder: Number(row.fiscalYearOrder)
    }))),
    getForecastRows(db, agreementId, currency),
    agreementFinancials.getCommitmentPaymentCapacity({
      fiscalYearId: input.fiscalYearId,
      commitmentTypeId: input.commitmentTypeId,
      currency,
      ...(input.excludePaymentId ? { excludePaymentId: input.excludePaymentId } : {})
    }).then(result => parseMoneyText(result.capacityAmount)),
    getBudgetSources(db, agreementId, currency),
    agreementFinancials.getRecordedPaidToDate({ fiscalYearId: input.fiscalYearId, periodEnd: input.periodEnd, currency,
      ...(input.excludePaymentId ? { excludePaymentId: input.excludePaymentId } : {}) }),
    getCreditMemoSources(db, agreementId, currency, selectedPosition.fiscalYearOrder)
  ])
  return buildAgreementPaymentFinancialInputs({
    agreementId, currency, selectedPeriod: selectedPosition,
    claims: [...reconciliations, ...claimRecoveries], forecasts: forecastRows, budgets: budgetSources.rows,
    finalReconciliations: reconciliations.filter(row => row.isFinal), creditMemoSources,
    fiscalYearOrders: budgetSources.fiscalYearOrders, recordedPaid, commitmentRemaining,
    ...holdbackSettings
  })
}
