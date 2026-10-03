import { addMoney, compareMoney, isNumeric19Money, parseMoney, subtractMoney, sumMoney, type Money } from './money'

export type CorrectionFinancialLine = {
  egcs_fc_commitmentline: string
  egcs_fc_agencychartofaccount: string
  egcs_fc_commitmentamount: Money
  egcs_fc_originalpaid: Money
  egcs_fc_jveffect: Money
  egcs_fc_priorcorrections: Money
  egcs_fc_arrecoveries?: Money
  egcs_fc_adjustment: Money
}

/**
 * Stable business reference shared by packets, displays, exports, and notification integrations.
 * @param correction - Retained Agreement number and immutable Correction sequence.
 * @param correction.egcs_fc_agreementnumber - Agreement business reference captured at creation.
 * @param correction.egcs_fc_number - Immutable Correction sequence within the Agreement.
 * @returns The canonical business reference.
 */
export const formatCorrectionReference = (correction: { egcs_fc_agreementnumber: string; egcs_fc_number: number }): string =>
  `${correction.egcs_fc_agreementnumber}-COR-${correction.egcs_fc_number}`

/** A stable bilingual API error code for a rejected signed accounting batch. */
export class CorrectionAccountingError extends Error {
  /**
   * Retains the independently checked business invariant.
   * @param code - Stable domain validation code.
   */
  constructor(readonly code: string) {
    super(code)
  }
}

/**
 * Validates signed exact-line attribution and the complete shared coding batch.
 * @param lines - Retained exact-line paid components and proposed signed adjustments.
 * @param capacity - Complete Agreement coding pools, including incoming JV allocations.
 * @param options - Draft or Completion validation mode.
 * @param options.requireAdjustment - Whether at least one nonzero line is required.
 * @returns Corrected amounts and remaining balances for every line.
 */
export const validateCorrectionAdjustments = (
  lines: CorrectionFinancialLine[],
  capacity: Map<string, { committed: Money; paid: Money }>,
  options: { requireAdjustment: boolean }
) => {
  const seen = new Set<string>()
  const codingDeltas = new Map<string, Money>()
  const zero = parseMoney('0.00')
  const projected = lines.map(line => {
    if (seen.has(line.egcs_fc_commitmentline)) throw new CorrectionAccountingError('COR_DUPLICATE_LINE')
    seen.add(line.egcs_fc_commitmentline)
    if (!isNumeric19Money(line.egcs_fc_adjustment)) throw new CorrectionAccountingError('COR_PRECISION')
    const original = sumMoney([line.egcs_fc_originalpaid, line.egcs_fc_jveffect, line.egcs_fc_priorcorrections, line.egcs_fc_arrecoveries ?? zero])
    const corrected = addMoney(original, line.egcs_fc_adjustment)
    if (compareMoney(corrected, zero) < 0 || compareMoney(corrected, line.egcs_fc_commitmentamount) > 0) {
      throw new CorrectionAccountingError('COR_LINE_CAPACITY')
    }
    codingDeltas.set(line.egcs_fc_agencychartofaccount,
      addMoney(codingDeltas.get(line.egcs_fc_agencychartofaccount) ?? zero, line.egcs_fc_adjustment))
    return { ...line, egcs_fc_correctedpaid: corrected, egcs_fc_remaining: subtractMoney(line.egcs_fc_commitmentamount, corrected) }
  })
  if (options.requireAdjustment && !lines.some(line => compareMoney(line.egcs_fc_adjustment, zero) !== 0)) {
    throw new CorrectionAccountingError('COR_ADJUSTMENT_REQUIRED')
  }
  for (const [codingId, delta] of codingDeltas) {
    const pool = capacity.get(codingId)
    if (!pool) throw new CorrectionAccountingError('COR_CODING_LINEAGE')
    const paid = addMoney(pool.paid, delta)
    if (compareMoney(paid, zero) < 0 || compareMoney(paid, pool.committed) > 0) {
      throw new CorrectionAccountingError('COR_SHARED_CAPACITY')
    }
  }
  return projected
}
