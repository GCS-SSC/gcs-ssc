/* eslint-disable jsdoc/require-jsdoc -- typed comparison and fiscal-duration helpers */
import { parseDate } from '@internationalized/date'
import { compareMoney, compareScaledMoney, divideMoney, getCurrencyMinorUnitFactor, isCanonicalMoney, moneyCalculator, moneyFromMinorUnits, multiplyMoney, parseCurrencyMoney, parseDecimalText } from './money'
import type { Money } from './money'

const isMoneyValue = (value: unknown): value is Money => typeof value === 'object' && value !== null && !Array.isArray(value) && isCanonicalMoney(value)
const thresholdFormatter = new Intl.NumberFormat('en-US', { useGrouping: false, maximumSignificantDigits: 21 })
const compareMoneyThreshold = (value: Money, threshold: number) => compareScaledMoney(
  value, parseDecimalText('1'), moneyFromMinorUnits(getCurrencyMinorUnitFactor(value.currency), value.currency),
  parseDecimalText(thresholdFormatter.format(threshold))
)

export const compareAssessmentValues = (left: unknown, right: unknown): -1 | 0 | 1 | undefined => {
  if (isMoneyValue(left) || isMoneyValue(right)) {
    try {
      if (isMoneyValue(left)) {
        if (typeof right === 'number' && Number.isFinite(right)) return compareMoneyThreshold(left, right)
        return isMoneyValue(right) ? compareMoney(left, right) : undefined
      }
      if (isMoneyValue(right) && typeof left === 'number' && Number.isFinite(left)) {
        const comparison = compareMoneyThreshold(right, left)
        return comparison === 0 ? 0 : comparison === 1 ? -1 : 1
      }
    } catch { return undefined }
    return undefined
  }
  return typeof left === 'number' && Number.isFinite(left) && typeof right === 'number' && Number.isFinite(right)
    ? left < right ? -1 : left > right ? 1 : 0
    : undefined
}

export const assessmentValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Array.isArray(left)) return left.some(value => assessmentValuesEqual(value, right))
  if (Array.isArray(right)) return right.some(value => assessmentValuesEqual(left, value))
  if (isMoneyValue(left) || isMoneyValue(right)) return compareAssessmentValues(left, right) === 0
  return left === right
}

export const resolveAssessmentHelperWeight = (value: unknown, weights: Record<string, number>): number | undefined => {
  if (value === undefined || value === null) return undefined
  if (Array.isArray(value)) return undefined
  if (isMoneyValue(value)) {
    return Object.entries(weights).find(([key]) => {
      try {
        return compareMoney(value, parseCurrencyMoney(key, value.currency)) === 0
      } catch {
        return false
      }
    })?.[1]
  }
  return weights[String(value)]
}

export const findAssessmentHelperBand = <T extends { max: number }>(rows: T[], value: unknown): T | undefined =>
  rows.reduce<T | undefined>((selected, row) => {
    const comparison = compareAssessmentValues(value, row.max)
    return comparison !== undefined && comparison <= 0 && (!selected || row.max < selected.max) ? row : selected
  }, undefined)

/**
 * Inclusive authorized dates prorated over the owning Agency's fiscal-year intervals.
 * @param total Current program funding in the Agreement currency.
 * @param startDate Authorized first calendar day.
 * @param endDate Authorized last calendar day, included in the duration.
 * @param fiscalYears Agency fiscal-year date ranges, including years without budget rows.
 * @returns Annual funding rounded once, or undefined without unambiguous full fiscal coverage.
 */
export const averageAnnualAgreementValue = (
  total: Money,
  startDate: string,
  endDate: string,
  fiscalYears: Array<{ startDate: string; endDate: string }>
): Money | undefined => {
  const start = parseDate(startDate)
  const endExclusive = parseDate(endDate).add({ days: 1 })
  if (endExclusive.compare(start) <= 0) return undefined
  const daysBetween = (left: typeof start, right: typeof start) =>
    Math.round((right.toDate('UTC').getTime() - left.toDate('UTC').getTime()) / 86_400_000)
  const years = fiscalYears.map(year => ({ start: parseDate(year.startDate), end: parseDate(year.endDate).add({ days: 1 }) }))
    .filter(year => year.start.compare(endExclusive) < 0 && year.end.compare(start) > 0)
    .sort((left, right) => left.start.compare(right.start))
  let coveredUntil = start
  let numerator = BigInt(0)
  let denominator = BigInt(1)
  for (const year of years) {
    const overlapStart = year.start.compare(start) < 0 ? start : year.start
    const overlapEnd = year.end.compare(endExclusive) > 0 ? endExclusive : year.end
    if (overlapStart.compare(coveredUntil) !== 0) return undefined
    const yearDays = BigInt(daysBetween(year.start, year.end))
    numerator = moneyCalculator.add(moneyCalculator.multiply(numerator, yearDays),
      moneyCalculator.multiply(BigInt(daysBetween(overlapStart, overlapEnd)), denominator))
    denominator = moneyCalculator.multiply(denominator, yearDays)
    coveredUntil = overlapEnd
  }
  if (coveredUntil.compare(endExclusive) !== 0) return undefined
  return divideMoney(
    multiplyMoney(total, parseDecimalText(String(denominator))),
    parseDecimalText(String(numerator)),
    { rounding: 'halfAwayFromZero' }
  )
}
