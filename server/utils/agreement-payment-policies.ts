/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Policies share the financial-input source contract below. */
import type { GcsExtensionAgreementFinancials, GcsExtensionPaymentCalculationResult } from '@gcs-ssc/extensions/server'
import { addMoney, subtractMoney, sumMoney, parseMoneyText, type Money } from '~~/shared/utils/money'
import { allocateAccountReceivableCoding } from '~~/shared/utils/account-receivable'

export type PaymentPeriodPosition = { fiscalYearOrder: number; month: number }
export type PaymentPeriodAmount = PaymentPeriodPosition & { amount: Money }
export type PaymentBudgetAmount = { fiscalYearOrder: number; amount: Money }
export type PaymentReconciledPeriod = {
  fiscalYearOrder: number; periodStart: number; periodEnd: number; claimId: string; applicantRecipientId: string
}
export type PaymentCreditMemoSource = Omit<PaymentReconciledPeriod, 'claimId'> & {
  id: string; receivableId: string; claimId: string | null; principal: Money; creditAmount: Money
}
export type PaymentFinancialSources = {
  agreementId: string
  currency: string
  selectedPeriod: PaymentPeriodPosition
  claims: PaymentPeriodAmount[]
  finalReconciliations: PaymentReconciledPeriod[]
  creditMemoSources: PaymentCreditMemoSource[]
  forecasts: PaymentPeriodAmount[]
  budgets: PaymentBudgetAmount[]
  fiscalYearOrders: number[]
  recordedPaid: Awaited<ReturnType<GcsExtensionAgreementFinancials['getRecordedPaidToDate']>>
  commitmentRemaining: Money
  holdbackPercent: string
  holdbackBasis: 'fullagreement' | 'finalfiscal'
}

const zero = parseMoneyText('0')
const isOnOrBefore = (row: PaymentPeriodPosition, cutoff: PaymentPeriodPosition) =>
  row.fiscalYearOrder < cutoff.fiscalYearOrder
  || (row.fiscalYearOrder === cutoff.fiscalYearOrder && row.month <= cutoff.month)
const sumThrough = (rows: PaymentPeriodAmount[], cutoff: PaymentPeriodPosition) =>
  sumMoney(rows.filter(row => isOnOrBefore(row, cutoff)).map(row => row.amount))

/** Selects the last eligible reconciliation period, ignoring later Claims. */
export const lastReconciledClaimPeriodPolicy = (sources: PaymentFinancialSources): PaymentPeriodPosition | null =>
  sources.claims.filter(row => isOnOrBefore(row, sources.selectedPeriod))
    .reduce<PaymentPeriodPosition | null>((latest, row) =>
      latest === null || !isOnOrBefore(row, latest) ? row : latest, null)

/** Publishes reconciled Claims, including applied source-period Claim reductions. */
export const claimsToLastClaimMonthPolicy = (sources: PaymentFinancialSources, lastClaim: PaymentPeriodPosition | null): Money =>
  lastClaim ? sumThrough(sources.claims, lastClaim) : zero

/** Publishes cash and signed JV/Correction effects without Credit Memo recovery. */
export const paymentsToDatePolicy = (sources: PaymentFinancialSources): Money =>
  subtractMoney(parseMoneyText(sources.recordedPaid.recordedPaidAmount), parseMoneyText(sources.recordedPaid.accountReceivableRecoveryAmount))

/** Publishes posted linked Credits through the selected fiscal year, regardless of receipt month. */
export const creditMemosPolicy = (sources: PaymentFinancialSources): Money =>
  parseMoneyText(sources.recordedPaid.creditMemoAmount)

/** Publishes only credits attributable to finally reconciled source periods, independently of the total credits. */
export const creditMemosForReconciledPeriodsPolicy = (sources: PaymentFinancialSources): Money => {
  const eligible: Money[] = []
  for (const receivableId of new Set(sources.creditMemoSources.map(row => row.receivableId))) {
    const rows = sources.creditMemoSources.filter(row => row.receivableId === receivableId)
    // Split the whole recovered amount once, so separate partial receipts cannot drift by a cent.
    const allocations = allocateAccountReceivableCoding(rows[0]!.creditAmount, rows.map(row => ({
      id: row.id, egcs_fc_weight: row.principal, egcs_fc_capacity: row.principal
    })))
    for (const row of rows) {
      const final = sources.finalReconciliations.filter(claim =>
        claim.fiscalYearOrder === row.fiscalYearOrder && claim.applicantRecipientId === row.applicantRecipientId
        && (row.claimId === null || claim.claimId === row.claimId)
        && isOnOrBefore({ fiscalYearOrder: claim.fiscalYearOrder, month: claim.periodEnd }, sources.selectedPeriod))
      const reconciled = Array.from({ length: row.periodEnd - row.periodStart + 1 }, (_, index) => row.periodStart + index)
        .every(month => final.some(claim => claim.periodStart <= month && claim.periodEnd >= month))
      if (reconciled) eligible.push(allocations.find(allocation => allocation.id === row.id)!.egcs_fc_amount)
    }
  }
  return sumMoney(eligible)
}

/** Publishes active Forecast through the last eligible Claim's end month. */
export const forecastToLastClaimMonthPolicy = (sources: PaymentFinancialSources, lastClaim: PaymentPeriodPosition | null): Money =>
  lastClaim ? sumThrough(sources.forecasts, lastClaim) : zero

/** Publishes active Forecast through the selected payment end month. */
export const forecastToPeriodEndPolicy = (sources: PaymentFinancialSources): Money =>
  sumThrough(sources.forecasts, sources.selectedPeriod)

/** Publishes the authoritative host coding capacity for the selected Commitment type and year. */
export const commitmentRemainingPolicy = (sources: PaymentFinancialSources): Money => sources.commitmentRemaining

/** Publishes funded amounts across the Agreement's current budget. */
export const agreementBudgetPolicy = (sources: PaymentFinancialSources): Money =>
  sumMoney(sources.budgets.map(row => row.amount))

/** Keeps an empty final current fiscal year in the Agreement's holdback horizon. */
export const finalFiscalYearBudgetPolicy = (sources: PaymentFinancialSources): Money => {
  const finalYear = Math.max(...sources.fiscalYearOrders, sources.selectedPeriod.fiscalYearOrder)
  return sumMoney(sources.budgets.filter(row => row.fiscalYearOrder === finalYear).map(row => row.amount))
}

/** Publishes unpaid eligibility across reconciled Claims, remaining current-year Forecast and future budgets. */
export const availableForDisbursementPolicy = (
  sources: PaymentFinancialSources,
  lastClaim: PaymentPeriodPosition | null,
  claims: Money,
  payments: Money,
  credits: Money
): Money => {
  const cutoffMonth = lastClaim?.fiscalYearOrder === sources.selectedPeriod.fiscalYearOrder ? lastClaim.month : -1
  const unclaimedForecast = sumMoney(sources.forecasts.filter(row =>
    row.fiscalYearOrder === sources.selectedPeriod.fiscalYearOrder && row.month > cutoffMonth).map(row => row.amount))
  const futureBudget = sumMoney(sources.budgets.filter(row =>
    row.fiscalYearOrder > sources.selectedPeriod.fiscalYearOrder).map(row => row.amount))
  return subtractMoney(addMoney(addMoney(claims, unclaimedForecast), futureBudget), subtractMoney(payments, credits))
}

/**
 * Runs host financial-input policies in order and publishes every result through the existing SDK contract.
 * Entitlement, holdback reserve/release and the final payment amount remain extension-owned.
 */
export const buildAgreementPaymentFinancialInputs = (sources: PaymentFinancialSources): GcsExtensionPaymentCalculationResult => {
  const lastClaim = lastReconciledClaimPeriodPolicy(sources)
  const totalClaimsToLastClaimMonth = claimsToLastClaimMonthPolicy(sources, lastClaim)
  const totalPaymentsToDate = paymentsToDatePolicy(sources)
  const totalCreditMemos = creditMemosPolicy(sources)
  const totalCreditMemosForReconciledPeriods = creditMemosForReconciledPeriodsPolicy(sources)
  const totalForecastToLastClaimMonth = forecastToLastClaimMonthPolicy(sources, lastClaim)
  const totalForecastToPeriodEnd = forecastToPeriodEndPolicy(sources)
  const commitmentRemaining = commitmentRemainingPolicy(sources)
  const agreementTotal = agreementBudgetPolicy(sources)
  const finalFiscalYearTotal = finalFiscalYearBudgetPolicy(sources)
  const availableForDisbursementBeforeHoldback = availableForDisbursementPolicy(
    sources, lastClaim, totalClaimsToLastClaimMonth, totalPaymentsToDate, totalCreditMemos
  )

  if ((sources.recordedPaid.currency === null && totalPaymentsToDate !== zero)
    || (sources.recordedPaid.currency !== null && sources.recordedPaid.currency.toLowerCase() !== sources.currency)) {
    throw new Error('The payment accounting currency does not match the Agreement.')
  }

  return {
    agreementId: sources.agreementId, currency: sources.currency,
    totalClaimsToLastClaimMonth, totalPaymentsToDate, totalCreditMemos, totalCreditMemosForReconciledPeriods, totalForecastToLastClaimMonth,
    totalForecastToPeriodEnd, commitmentRemaining, agreementTotal, finalFiscalYearTotal,
    availableForDisbursementBeforeHoldback, holdbackPercent: sources.holdbackPercent, holdbackBasis: sources.holdbackBasis
  }
}
