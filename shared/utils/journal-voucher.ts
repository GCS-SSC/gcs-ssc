import type { TransferPaymentStreamChartOfAccountDimension } from '../types/schemas/transfer-payment'
import { isNumeric19Money, moneyFromCents, moneyToCents, type Money } from './money'

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
 * @returns Nonzero, signed adjustment rows.
 */
export const generateJournalVoucherAdjustments = (
  original: JournalVoucherAccountingLine[], corrected: JournalVoucherAccountingLine[],
  options: { requireAdjustment: boolean }
): JournalVoucherAccountingLine[] => {
  if (!original.length || !corrected.length) throw new JournalVoucherAccountingError('JV_LINES_REQUIRED')
  const originalTotals = new Map<string, bigint>()
  const correctedTotals = new Map<string, bigint>()
  const grouped = new Map<string, { line: JournalVoucherAccountingLine; cents: bigint }>()
  for (const [lines, totals, sign] of [[original, originalTotals, BigInt(-1)], [corrected, correctedTotals, BigInt(1)]] as const) {
    for (const line of lines) {
      const cents = moneyToCents(line.egcs_fc_amount)
      if (cents < BigInt(0) || !isNumeric19Money(line.egcs_fc_amount)) throw new JournalVoucherAccountingError('JV_AMOUNT_RANGE')
      totals.set(line.egcs_fc_commitmentline, (totals.get(line.egcs_fc_commitmentline) ?? BigInt(0)) + cents)
      const key = codingKey(line)
      const group = grouped.get(key) ?? { line, cents: BigInt(0) }
      group.cents += sign * cents
      grouped.set(key, group)
    }
  }
  if ([...correctedTotals.keys()].some(id => !originalTotals.has(id))) throw new JournalVoucherAccountingError('JV_COMMITMENT_MISMATCH')
  if ([...originalTotals].some(([id, cents]) => correctedTotals.get(id) !== cents)) throw new JournalVoucherAccountingError('JV_UNBALANCED')
  const adjustments = [...grouped.values()].filter(group => group.cents !== BigInt(0)).map(group => {
    const amount = moneyFromCents(group.cents)
    if (!isNumeric19Money(amount)) throw new JournalVoucherAccountingError('JV_AMOUNT_RANGE')
    const { id: _id, ...line } = group.line
    return { ...line, egcs_fc_amount: amount }
  })
  if (options.requireAdjustment && !adjustments.length) throw new JournalVoucherAccountingError('JV_NO_ADJUSTMENT')
  return adjustments
}

/**
 * A reversal swaps the retained allocations, exactly negating the original adjustment rows.
 * @param original Retained source allocations of the correction.
 * @param corrected Retained corrected allocations of the correction.
 * @returns Reversal allocations and their exact adjustments.
 */
export const reverseJournalVoucherAllocations = (original: JournalVoucherAccountingLine[], corrected: JournalVoucherAccountingLine[]) => ({
  original: corrected.map(line => ({ ...line })),
  corrected: original.map(line => ({ ...line })),
  adjustments: generateJournalVoucherAdjustments(corrected, original, { requireAdjustment: true })
})
