/* eslint-disable jsdoc/require-jsdoc -- Local shaping helpers are covered by the exported builder's contract. */
import type { Currency_Codes } from '~~/shared/types/database'
import { addMoney, compareMoney, parseMoney, sumMoney, type Money } from '~~/shared/utils/money'

export type SummaryFiscalYear = { id: string, label: string, order: string }
export type SummaryBudgetLine = {
  id: string
  fiscalYearId: string
  categoryNameEn: string
  categoryNameFr: string
  costSubsection: string | null
  nameEn: string
  nameFr: string
  description: string | null
  budget: Money
  currency: Currency_Codes
}
export type SummaryForecast = { id: string, fiscalYearId: string, active: boolean }
export type SummaryForecastLine = {
  id: string
  forecastId: string
  fiscalYearId: string
  budgetLineId: string
  month: number
  version: string
  description: string | null
  amount: Money
  currency: Currency_Codes
}
export type SummaryClaimLine = {
  id: string
  claimId: string
  fiscalYearId: string
  periodStart: number
  periodEnd: number
  budgetLineId: string | null
  description: string
  amount: Money
  currency: Currency_Codes
}
export type SummaryReconciliation = {
  id: string
  claimLineId: string
  amount: Money
  positive: boolean
}
export type SummaryPayment = {
  id: string
  fiscalYearId: string
  periodStart: number
  periodEnd: number
  amount: Money
  currency: Currency_Codes
  terminal: boolean
}
export type SummaryAccountingEntry = {
  id: string; fiscalYearId: string; month: number; amount: Money; currency: Currency_Codes;
  kind: 'journal_voucher' | 'correction'
}

const ZERO = parseMoney('0')
const MONTH_COUNT = 12
const emptyMonths = (): Money[] => Array.from({ length: MONTH_COUNT }, () => ZERO)
const assertMonth = (month: number): number => {
  if (!Number.isInteger(month) || month < 0 || month >= MONTH_COUNT) {
    throw new RangeError('Fiscal month must be an integer from 0 through 11.')
  }
  return month
}
const compareNumericText = (left: string, right: string): number => {
  if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
    const first = BigInt(left)
    const second = BigInt(right)
    return first < second ? -1 : first > second ? 1 : 0
  }
  return left.localeCompare(right)
}

type SummaryLine = SummaryBudgetLine & {
  forecast: Money[] | null
  claimed: Money[]
  reconciled: Money[]
}

const lineFromBudget = (line: SummaryBudgetLine, hasActiveForecast: boolean): SummaryLine => ({
  ...line,
  forecast: hasActiveForecast ? emptyMonths() : null,
  claimed: emptyMonths(), reconciled: emptyMonths()
})

/**
 * Builds one fiscal-year-at-a-time monthly financial grid. Annual budget has no monthly allocation.
 *
 * @param fiscalYears - Current agreement budget fiscal years.
 * @param budgetLines - Current annual budget lines, using stable lineage IDs and total amount.
 * @param forecasts - Authored forecast records; only the active record may be displayed.
 * @param forecastLines - Monthly lines across authored versions.
 * @param claimLines - Non-deleted claim lines.
 * @param reconciliations - Reconciliation lines with positive lifecycle evidence.
 * @param payments - Payment records with terminal status indicators.
 * @param accountingEntries - Effective separately attributed JV and Correction entries.
 * @returns Fiscal years with currency-specific monthly line grids and payment totals.
 */
export const buildAgreementFinancialSummary = (
  fiscalYears: SummaryFiscalYear[],
  budgetLines: SummaryBudgetLine[],
  forecasts: SummaryForecast[],
  forecastLines: SummaryForecastLine[],
  claimLines: SummaryClaimLine[],
  reconciliations: SummaryReconciliation[],
  payments: SummaryPayment[],
  accountingEntries: SummaryAccountingEntry[] = []
) => ({
  fiscalYears: [...fiscalYears].sort((a, b) => a.order.localeCompare(b.order)).map(year => {
    const yearBudgetLines = budgetLines.filter(line => line.fiscalYearId === year.id)
    const selectedForecast = forecasts.filter(forecast => forecast.fiscalYearId === year.id && forecast.active)
      .sort((a, b) => compareNumericText(b.id, a.id))[0]
    const authoredLines = forecastLines.filter(line => line.fiscalYearId === year.id && line.forecastId === selectedForecast?.id)
    const version = authoredLines.reduce<string | null>((latest, line) =>
      latest === null || compareNumericText(line.version, latest) > 0 ? line.version : latest, null)
    const yearForecastLines = authoredLines.filter(line => line.version === version)
    const yearClaimLines = claimLines.filter(line => line.fiscalYearId === year.id)
      .sort((a, b) => compareNumericText(a.id, b.id))
    const yearPayments = payments.filter(payment => payment.fiscalYearId === year.id && payment.terminal)
      .sort((a, b) => a.periodEnd - b.periodEnd || a.periodStart - b.periodStart || compareNumericText(a.id, b.id))
    const currencies = new Set<Currency_Codes>([
      ...yearBudgetLines.map(line => line.currency),
      ...yearForecastLines.map(line => line.currency),
      ...yearClaimLines.map(line => line.currency),
      ...yearPayments.map(payment => payment.currency),
      ...accountingEntries.filter(entry => entry.fiscalYearId === year.id).map(entry => entry.currency)
    ])
    if (currencies.size === 0) currencies.add('cad')

    const reconciledByClaimLine = new Map<string, Money>()
    for (const row of reconciliations) {
      if (!row.positive) continue
      reconciledByClaimLine.set(row.claimLineId, addMoney(reconciledByClaimLine.get(row.claimLineId) ?? ZERO, row.amount))
    }

    const groups = [...currencies].sort().map(currency => {
      const lines = yearBudgetLines.filter(line => line.currency === currency)
        .map(line => lineFromBudget(line, Boolean(selectedForecast)))
      const byId = new Map(lines.map(line => [line.id, line]))
      const ensureUnmatchedLine = (id: string, description: string): SummaryLine => {
        const existing = byId.get(id)
        if (existing) return existing
        const line = lineFromBudget({
          id, fiscalYearId: year.id,
          categoryNameEn: '', categoryNameFr: '',
          costSubsection: null,
          nameEn: description, nameFr: description, description,
          budget: ZERO, currency
        }, Boolean(selectedForecast))
        lines.push(line)
        byId.set(id, line)
        return line
      }

      for (const forecast of yearForecastLines.filter(row => row.currency === currency)) {
        const line = byId.get(forecast.budgetLineId)
          ?? ensureUnmatchedLine(forecast.budgetLineId, forecast.description || `#${forecast.budgetLineId}`)
        const month = assertMonth(forecast.month)
        if (line.forecast) line.forecast[month] = addMoney(line.forecast[month] ?? ZERO, forecast.amount)
      }
      let latestReconciledMonth: number | null = null
      for (const claim of yearClaimLines.filter(row => row.currency === currency)) {
        // A claim/reconciliation spanning months is recognized in the end month, including overlaps.
        const line = claim.budgetLineId ? byId.get(claim.budgetLineId) : undefined
        const target = line ?? ensureUnmatchedLine(claim.budgetLineId ?? `claim:${claim.id}`, claim.description)
        if (target.budget === ZERO && target.nameEn === `#${claim.budgetLineId}` && claim.description) {
          target.nameEn = claim.description
          target.nameFr = claim.description
          target.description = claim.description
        }
        const month = assertMonth(claim.periodEnd)
        target.claimed[month] = addMoney(target.claimed[month] ?? ZERO, claim.amount)
        const reconciled = reconciledByClaimLine.get(claim.id) ?? ZERO
        target.reconciled[month] = addMoney(target.reconciled[month] ?? ZERO, reconciled)
        if (compareMoney(reconciled, ZERO) > 0) latestReconciledMonth = Math.max(latestReconciledMonth ?? month, month)
      }

      const paid = emptyMonths()
      const paymentItems = yearPayments.filter(payment => payment.currency === currency).map(payment => {
        const month = assertMonth(payment.periodEnd)
        paid[month] = addMoney(paid[month] ?? ZERO, payment.amount)
        return {
          id: payment.id,
          month,
          periodStart: payment.periodStart,
          periodEnd: payment.periodEnd,
          amount: payment.amount,
          currency
        }
      })
      const monthlyForecast = selectedForecast ? emptyMonths() : null
      if (monthlyForecast) {
        for (const line of lines) {
          if (!line.forecast) continue
          for (let month = 0; month < MONTH_COUNT; month += 1) {
            monthlyForecast[month] = addMoney(monthlyForecast[month] ?? ZERO, line.forecast[month] ?? ZERO)
          }
        }
      }
      const progress = {
        annualBudget: sumMoney(yearBudgetLines.filter(line => line.currency === currency).map(line => line.budget)),
        reconciledTotal: sumMoney(lines.flatMap(line => line.reconciled)),
        latestReconciledMonth,
        forecastToReconciliation: monthlyForecast && latestReconciledMonth !== null
          ? sumMoney(monthlyForecast.slice(0, latestReconciledMonth + 1))
          : null,
        annualForecast: monthlyForecast ? sumMoney(monthlyForecast) : null,
        monthlyForecast
      }
      const yearEntries = accountingEntries.filter(entry => entry.fiscalYearId === year.id && entry.currency === currency)
      const jvEffects = emptyMonths()
      const correctionAdjustments = emptyMonths()
      for (const entry of yearEntries) {
        const month = assertMonth(entry.month)
        const target = entry.kind === 'journal_voucher' ? jvEffects : correctionAdjustments
        target[month] = addMoney(target[month] ?? ZERO, entry.amount)
      }
      const correctedRecordedPaid = paid.map((amount, month) => sumMoney([amount, jvEffects[month] ?? ZERO, correctionAdjustments[month] ?? ZERO]))
      return { currency, lines, paid, payments: paymentItems, progress,
        jvEffects, correctionAdjustments, correctedRecordedPaid, accountingEntries: yearEntries }
    })
    return {
      id: year.id,
      label: year.label,
      forecastSource: {
        status: selectedForecast ? 'active' as const : 'none' as const,
        forecastId: selectedForecast?.id ?? null,
        version
      },
      currencies: groups
    }
  })
})
