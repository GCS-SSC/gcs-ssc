/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Internal financial readers share the documented calculation entry point. */
import { sql, type Kysely, type Transaction } from 'kysely'
import type { GcsExtensionAgreementFinancials, GcsExtensionPaymentCalculationInput, GcsExtensionPaymentCalculationResult } from '@gcs-ssc/extensions/server'
import type { Currency_Codes, Database } from '~~/shared/types/database'
import { CURRENCY_CODES_ENUM } from '~~/shared/constants/enums'
import { addMoney, subtractMoney, sumMoney, parseMoneyText, parseMoney, moneyToCents, moneyFromCents, compareMoney, NUMERIC_19_2_MAX_MONEY, type Money } from '~~/shared/utils/money'
import { databaseMoneyText, parseDatabaseMoney } from './database-money'

type Db = Kysely<Database> | Transaction<Database>
type PeriodPosition = { fiscalYearOrder: number, month: number }
type AmountPeriodRow = PeriodPosition & { amount: Money }
type AgreementPaymentHoldbackSettings = { holdbackPercent: string, holdbackBasis: 'fullagreement' | 'finalfiscal' }
const ZERO_MONEY = parseMoney('0')
const stableBudgetFiscalYearId = sql<string>`COALESCE(
  "Funding_Case_Agreement_Budget_Fiscal_Year"."egcs_fc_originalbudgetfiscalyear",
  "Funding_Case_Agreement_Budget_Fiscal_Year"."id"
)`

export interface AgreementPaymentCalculationValues {
  agreementId: string
  currency: string
  paymentType: 'reimbursement' | 'advance'
  totalClaimsToLastClaimMonth: Money
  totalPaymentsToDate: Money
  totalForecastToLastClaimMonth: Money
  totalForecastToPeriodEnd: Money
  commitmentRemaining: Money
  agreementTotal: Money
  finalFiscalYearTotal: Money
  availableForDisbursementBeforeHoldback: Money
  releaseHoldback?: boolean
  holdbackReleaseAmount?: string
}

const nonnegative = (amount: Money): Money => compareMoney(amount, ZERO_MONEY) < 0 ? ZERO_MONEY : amount
const minimum = (...amounts: Money[]): Money => amounts.reduce((left, right) => compareMoney(left, right) <= 0 ? left : right)

/** Applies exact entitlement and whole-dollar holdback rules to the host financial inputs. */
export const calculateAgreementPaymentValues = (
  values: AgreementPaymentCalculationValues,
  settings: AgreementPaymentHoldbackSettings
): GcsExtensionPaymentCalculationResult => {
  const { totalClaimsToLastClaimMonth: claims, totalPaymentsToDate: payments,
    totalForecastToLastClaimMonth: forecastClaim, totalForecastToPeriodEnd: forecastPeriod } = values
  const baseAmount = nonnegative(values.paymentType === 'advance'
    ? subtractMoney(addMoney(subtractMoney(claims, forecastClaim), forecastPeriod), payments)
    : subtractMoney(claims, payments))
  const basis = settings.holdbackBasis === 'finalfiscal' ? values.finalFiscalYearTotal : values.agreementTotal
  const percentageHundredths = moneyToCents(parseMoneyText(settings.holdbackPercent))
  if (moneyToCents(basis) < BigInt(0) || percentageHundredths < BigInt(0) || percentageHundredths > BigInt(10000)) {
    throw new Error('Holdback requires a nonnegative basis and a percentage between zero and 100.')
  }
  const holdbackAmount = moneyFromCents(moneyToCents(basis) * percentageHundredths / BigInt(1000000) * BigInt(100))
  const unpaidEligibleBalance = nonnegative(values.availableForDisbursementBeforeHoldback)
  const reserve = minimum(holdbackAmount, unpaidEligibleBalance)
  const requestedRelease = values.releaseHoldback ? nonnegative(parseMoney(values.holdbackReleaseAmount ?? '0')) : ZERO_MONEY
  const holdbackReleaseAmount = minimum(requestedRelease, reserve)
  const availableBeforeHoldback = subtractMoney(unpaidEligibleBalance, reserve)
  const ceilingAmount = nonnegative(minimum(baseAmount, values.commitmentRemaining,
    addMoney(availableBeforeHoldback, holdbackReleaseAmount), NUMERIC_19_2_MAX_MONEY))
  return {
    agreementId: values.agreementId, currency: values.currency,
    baseAmount, commitmentRemaining: values.commitmentRemaining, availableBeforeHoldback,
    holdbackReleaseAmount, totalClaimsToLastClaimMonth: claims, totalPaymentsToDate: payments,
    totalForecastToLastClaimMonth: forecastClaim, totalForecastToPeriodEnd: forecastPeriod,
    ceilingAmount, suggestedAmount: ceilingAmount, holdbackAmount
  }
}

const isOnOrBefore = (row: PeriodPosition, position: PeriodPosition): boolean =>
  row.fiscalYearOrder < position.fiscalYearOrder
  || (row.fiscalYearOrder === position.fiscalYearOrder && row.month <= position.month)

const sumPeriodRows = (rows: AmountPeriodRow[], position: PeriodPosition): Money =>
  sumMoney(rows.filter(row => isOnOrBefore(row, position)).map(row => row.amount))

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
): Promise<PeriodPosition> => {
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
const getClaimRows = async (db: Db, agreementId: string, currency: Currency_Codes): Promise<AmountPeriodRow[]> => {
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
    .execute() as Array<{ amount?: unknown, month?: unknown, fiscal_year_order?: unknown }>

  return rows.map(row => ({
    amount: parseDatabaseMoney(row.amount),
    month: Number(row.month ?? 0),
    fiscalYearOrder: Number(row.fiscal_year_order ?? 0)
  }))
}

/**
 *
 */
const getLastClaimPosition = (claimRows: AmountPeriodRow[], selectedPosition: PeriodPosition): PeriodPosition | null => {
  const eligibleRows = claimRows.filter(row => isOnOrBefore(row, selectedPosition))
  if (eligibleRows.length === 0) {
    return null
  }

  return eligibleRows.reduce((latest, row) => {
    if (row.fiscalYearOrder > latest.fiscalYearOrder) {
      return row
    }
    if (row.fiscalYearOrder === latest.fiscalYearOrder && row.month > latest.month) {
      return row
    }
    return latest
  })
}

/** Loads active forecast line amounts and their fiscal-period positions for an agreement. */
const getForecastRows = async (db: Db, agreementId: string, currency: Currency_Codes): Promise<AmountPeriodRow[]> => {
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

/** Aggregates agreement, final-year, and future-year budget totals for the selected period. */
const getBudgetTotals = async (
  db: Db,
  agreementId: string,
  selectedPosition: PeriodPosition,
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
  const finalFiscalYearOrder = Math.max(...fiscalYears.map(row => Number(row.fiscal_year_order)), selectedPosition.fiscalYearOrder)

  return {
    agreementTotal: sumMoney(normalizedRows.map(row => row.amount)),
    finalFiscalYearTotal: sumMoney(normalizedRows.filter(row => row.fiscalYearOrder === finalFiscalYearOrder).map(row => row.amount)),
    futureFiscalYearTotal: sumMoney(normalizedRows.filter(row => row.fiscalYearOrder > selectedPosition.fiscalYearOrder).map(row => row.amount))
  }
}

/** Calculates the eight host-owned Payment inputs from current Agreement financial records. */
export const getAgreementPaymentCalculation = async (
  db: Db,
  agreementId: string,
  input: GcsExtensionPaymentCalculationInput,
  agreementFinancials: Pick<GcsExtensionAgreementFinancials, 'getCommitmentPaymentCapacity' | 'getRecordedPaidToDate' | 'getClaimRecoveryProjection'>
): Promise<GcsExtensionPaymentCalculationResult> => {
  const currency = CURRENCY_CODES_ENUM.find(code => code === input.currency)
  if (!currency) throw new Error('A resolved Agreement currency is required.')
  if (!Number.isInteger(input.periodEnd) || input.periodEnd < 0 || input.periodEnd > 11) throw new Error('Payment period end must be a fiscal month from zero through eleven.')
  const holdbackSettings = await getAgreementHoldbackSettings(db, agreementId, currency)
  const selectedPosition = await getSelectedPaymentPeriod(db, agreementId, input.fiscalYearId, input.periodEnd)
  const [
    claimRows,
    forecastRows,
    commitmentRemaining,
    budgetTotals,
    recordedPaid
  ] = await Promise.all([
    Promise.all([getClaimRows(db, agreementId, currency), agreementFinancials.getClaimRecoveryProjection()])
      .then(([original, recoveries]) => [...original, ...recoveries.entries.filter(row => row.currency === currency).map(row => ({
        amount: parseMoneyText(row.amount), month: row.month, fiscalYearOrder: Number(row.fiscalYearOrder)
      }))]),
    getForecastRows(db, agreementId, currency),
    agreementFinancials.getCommitmentPaymentCapacity({
      fiscalYearId: input.fiscalYearId,
      commitmentTypeId: input.commitmentTypeId,
      currency,
      ...(input.excludePaymentId ? { excludePaymentId: input.excludePaymentId } : {})
    }).then(result => parseMoneyText(result.capacityAmount)),
    getBudgetTotals(db, agreementId, selectedPosition, currency),
    agreementFinancials.getRecordedPaidToDate({ fiscalYearId: input.fiscalYearId, periodEnd: input.periodEnd, currency,
      ...(input.excludePaymentId ? { excludePaymentId: input.excludePaymentId } : {}) })
  ])
  const totalPaymentsToDate = parseMoneyText(recordedPaid.recordedPaidAmount)
  if ((recordedPaid.currency === null && totalPaymentsToDate !== ZERO_MONEY)
    || (recordedPaid.currency !== null && recordedPaid.currency.toLowerCase() !== currency)) {
    throw new Error('The payment accounting currency does not match the Agreement.')
  }
  const lastClaimPosition = getLastClaimPosition(claimRows, selectedPosition)
  const claimCutoff = lastClaimPosition ?? { fiscalYearOrder: selectedPosition.fiscalYearOrder, month: -1 }
  const totalClaimsToLastClaimMonth = sumPeriodRows(claimRows, claimCutoff)
  const totalForecastToLastClaimMonth = lastClaimPosition ? sumPeriodRows(forecastRows, lastClaimPosition) : ZERO_MONEY
  const totalForecastToPeriodEnd = sumPeriodRows(forecastRows, selectedPosition)
  const forecastUnclaimedCurrentFiscalYear = sumMoney(forecastRows.filter(row => {
    const latestClaimMonthInSelectedFiscalYear = lastClaimPosition?.fiscalYearOrder === selectedPosition.fiscalYearOrder
      ? lastClaimPosition.month
      : -1
    return row.fiscalYearOrder === selectedPosition.fiscalYearOrder && row.month > latestClaimMonthInSelectedFiscalYear
  }).map(row => row.amount))
  const availableForDisbursementBeforeHoldback = subtractMoney(
    addMoney(addMoney(totalClaimsToLastClaimMonth, forecastUnclaimedCurrentFiscalYear), budgetTotals.futureFiscalYearTotal),
    totalPaymentsToDate
  )
  return calculateAgreementPaymentValues({
    agreementId, currency, paymentType: input.paymentType,
    totalClaimsToLastClaimMonth, totalPaymentsToDate, totalForecastToLastClaimMonth,
    totalForecastToPeriodEnd, commitmentRemaining, agreementTotal: budgetTotals.agreementTotal,
    finalFiscalYearTotal: budgetTotals.finalFiscalYearTotal, availableForDisbursementBeforeHoldback,
    releaseHoldback: input.releaseHoldback, holdbackReleaseAmount: input.holdbackReleaseAmount
  }, holdbackSettings)
}
