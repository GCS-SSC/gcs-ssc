import { addMoney, compareMoney, isPersistableMoney, subtractMoney, zeroMoney, type Money } from './money'
import type { TransferPaymentStreamChartOfAccountDimension } from '../types/schemas/transfer-payment'

export interface JournalVoucherAccountingLine {
  id?: string
  egcs_fc_commitmentline: string
  egcs_fc_commitmentlinenumber: number
  egcs_fc_chartofaccount: string
  egcs_fc_accountingdimensions: TransferPaymentStreamChartOfAccountDimension[]
  egcs_fc_amount: Money
}

/** A structural accounting failure with a stable localized API code. */
export class JournalVoucherAccountingError extends Error {
  /**
   * @param code Accounting invariant violated by the entry.
   */
  constructor(readonly code: 'JV_LINES_REQUIRED' | 'JV_COMMITMENT_MISMATCH' | 'JV_UNBALANCED' | 'JV_NO_ADJUSTMENT' | 'JV_AMOUNT_RANGE') {
    super(code)
  }
}

const codingKey = (line: JournalVoucherAccountingLine): string => JSON.stringify([
  line.egcs_fc_commitmentline, line.egcs_fc_chartofaccount,
  line.egcs_fc_accountingdimensions.map(dimension => [dimension.label_en, dimension.label_fr, dimension.value])
])

/**
 * Generates exact signed differences and validates each independently balanced commitment line.
 * @param original Retained source allocations.
 * @param corrected Proposed allocations.
 * @param options Completion versus Draft validation.
 * @param options.requireAdjustment Whether unchanged allocations must fail validation.
 * @param currency - Owning denomination.
 * @returns Nonzero, signed adjustment rows.
 */
export const generateJournalVoucherAdjustments = (
  original: JournalVoucherAccountingLine[], corrected: JournalVoucherAccountingLine[],
  options: { requireAdjustment: boolean }, currency: string
): JournalVoucherAccountingLine[] => {
  if (!original.length || !corrected.length) throw new JournalVoucherAccountingError('JV_LINES_REQUIRED')
  const zero = zeroMoney(currency)
  const originalTotals = new Map<string, Money>()
  const correctedTotals = new Map<string, Money>()
  const grouped = new Map<string, { line: JournalVoucherAccountingLine; amount: Money }>()
  for (const [lines, totals, originalSide] of [[original, originalTotals, true], [corrected, correctedTotals, false]] as const) {
    for (const line of lines) {
      const amount = line.egcs_fc_amount
      if (compareMoney(amount, zero) < 0 || !isPersistableMoney(amount)) throw new JournalVoucherAccountingError('JV_AMOUNT_RANGE')
      totals.set(line.egcs_fc_commitmentline, addMoney(totals.get(line.egcs_fc_commitmentline) ?? zero, amount))
      const key = codingKey(line)
      const group = grouped.get(key) ?? { line, amount: zero }
      group.amount = originalSide ? subtractMoney(group.amount, amount) : addMoney(group.amount, amount)
      grouped.set(key, group)
    }
  }
  if ([...correctedTotals.keys()].some(id => !originalTotals.has(id))) throw new JournalVoucherAccountingError('JV_COMMITMENT_MISMATCH')
  if ([...originalTotals].some(([id, amount]) => !correctedTotals.has(id) || compareMoney(correctedTotals.get(id)!, amount) !== 0)) throw new JournalVoucherAccountingError('JV_UNBALANCED')
  const adjustments = [...grouped.values()].filter(group => compareMoney(group.amount, zero) !== 0).map(group => {
    if (!isPersistableMoney(group.amount)) throw new JournalVoucherAccountingError('JV_AMOUNT_RANGE')
    const { id: _id, ...line } = group.line
    return { ...line, egcs_fc_amount: group.amount }
  })
  if (options.requireAdjustment && !adjustments.length) throw new JournalVoucherAccountingError('JV_NO_ADJUSTMENT')
  return adjustments
}

/**
 * A reversal swaps the retained allocations, exactly negating the original adjustment rows.
 * @param original Retained source allocations of the correction.
 * @param corrected Retained corrected allocations of the correction.
 * @param currency - Owning denomination.
 * @returns Reversal allocations and their exact adjustments.
 */
export const reverseJournalVoucherAllocations = (original: JournalVoucherAccountingLine[], corrected: JournalVoucherAccountingLine[], currency: string) => ({
  original: corrected.map(line => ({ ...line })),
  corrected: original.map(line => ({ ...line })),
  adjustments: generateJournalVoucherAdjustments(corrected, original, { requireAdjustment: true }, currency)
})
