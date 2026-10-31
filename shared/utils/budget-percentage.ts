import { parseDecimalText, percentageMoney, sumMoney, type Money } from './money'

export type BudgetCalculationMode = 'manual' | 'category' | 'all_other'

export interface PercentageBudgetRow {
  id: string
  versionId: string
  fiscalYearId: string
  currency: string
  categoryId: string
  mode: BudgetCalculationMode
  sourceCategoryId: string | null
  percentage: number | string | null
  programFunding: Money
}

/**
 * Converts a validated percentage to exact hundredths of one percent.
 * @param percentage - Percentage with at most two decimal places.
 * @returns Integer hundredths of one percent.
 */
export const percentageHundredths = (percentage: number | string): bigint => {
  if (!Number.isFinite(Number(percentage)) || !/^(?:\d+)(?:\.\d{1,2})?$/.test(String(percentage)) || Number(percentage) < 0 || Number(percentage) > 100) {
    throw new RangeError('Invalid budget percentage')
  }
  const [units = '0', fraction = ''] = String(percentage).split('.')
  return BigInt(units) * BigInt(100) + BigInt(fraction.padEnd(2, '0'))
}

/**
 * Applies a percentage and rounds once to whole currency units, ties away from zero.
 * @param base - Exact sum of source program funding.
 * @param percentage - Configured percentage.
 * @param currency - Owning denomination.
 * @returns Canonical whole-unit money.
 */
export const percentageProgramFunding = (base: Money, percentage: number | string, currency: string): Money => {
  percentageHundredths(percentage)
  return percentageMoney(sumMoney([base], currency), parseDecimalText(String(percentage)), { rounding: 'halfAwayFromZero', scale: 0 })
}

/**
 * Calculates independent version/year/currency groups, category charges before all-other charges.
 * @param rows - Active rows with their saved calculation settings.
 * @returns Persistable program funding by row identity.
 */
export const calculateBudgetPercentages = (rows: readonly PercentageBudgetRow[]): Map<string, Money> => {
  const amounts = new Map(rows.map(row => [row.id, row.programFunding]))
  const groups = new Map<string, PercentageBudgetRow[]>()
  for (const row of rows) {
    const key = JSON.stringify([row.versionId, row.fiscalYearId, row.currency])
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }
  for (const group of groups.values()) {
    if (group.filter(row => row.mode === 'all_other').length > 1) throw new RangeError('Duplicate all-other budget charge')
    for (const mode of ['category', 'all_other'] as const) {
      for (const row of group.filter(item => item.mode === mode)) {
        if (row.percentage === null) throw new RangeError('Missing budget percentage')
        const sources = group.filter(source => source.id !== row.id && (mode === 'all_other' || source.categoryId === row.sourceCategoryId))
        if (mode === 'category' && (row.sourceCategoryId === null || row.sourceCategoryId === row.categoryId || sources.some(source => source.mode !== 'manual'))) {
          throw new RangeError('Invalid percentage source category')
        }
        const base = sumMoney(sources.map(source => amounts.get(source.id)!), row.currency)
        amounts.set(row.id, percentageProgramFunding(base, row.percentage, row.currency))
      }
    }
  }
  return amounts
}
