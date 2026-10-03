import { addMoney, compareMoney, parseMoney, parseMoneyText, subtractMoney, sumMoney } from '~~/shared/utils/money'
import type { Money } from '~~/shared/utils/money'

export type CorrectionFinancialBasis = {
  egcs_fc_commitmentamount: string
  egcs_fc_originalpaid: string
  egcs_fc_jveffect: string
  egcs_fc_priorcorrections: string
  egcs_fc_arrecoveries?: string
  egcs_fc_adjustment: string
}
export type CorrectionLineBalance = {
  recordedPaid: Money
  adjustment: Money
  correctedPaid: Money
  remaining: Money
  withinCommitment: boolean
}

/**
 * Computes actual line attribution from exact saved amounts and a signed draft.
 *
 * @param line - Captured actual payments, JV effects and earlier Corrections.
 * @param adjustment - Current input; malformed input stays visible without invented totals.
 * @returns Exact balances, or null while the input is invalid.
 */
export const correctionLineBalance = (line: CorrectionFinancialBasis, adjustment: string): CorrectionLineBalance | null => {
  try {
    const signedAdjustment = parseMoney(adjustment)
    const recordedPaid = sumMoney([line.egcs_fc_originalpaid, line.egcs_fc_jveffect, line.egcs_fc_priorcorrections, line.egcs_fc_arrecoveries ?? '0.00'].map(parseMoneyText))
    const correctedPaid = addMoney(recordedPaid, signedAdjustment)
    const commitment = parseMoneyText(line.egcs_fc_commitmentamount)
    return {
      recordedPaid,
      adjustment: signedAdjustment,
      correctedPaid,
      remaining: subtractMoney(commitment, correctedPaid),
      withinCommitment: compareMoney(correctedPaid, parseMoney('0')) >= 0 && compareMoney(correctedPaid, commitment) <= 0
    }
  } catch {
    return null
  }
}

/**
 * Totals actual attribution rather than protective shared-coding floors.
 *
 * @param balances - Derived exact line balances.
 * @returns Exact totals, or null if any entered amount is invalid.
 */
export const correctionBalanceTotals = (balances: Array<CorrectionLineBalance | null>) => {
  if (balances.some(balance => balance === null)) return null
  const valid = balances as CorrectionLineBalance[]
  return {
    recordedPaid: sumMoney(valid.map(balance => balance.recordedPaid)),
    adjustment: sumMoney(valid.map(balance => balance.adjustment)),
    correctedPaid: sumMoney(valid.map(balance => balance.correctedPaid)),
    remaining: sumMoney(valid.map(balance => balance.remaining)),
    hasAdjustments: valid.some(balance => compareMoney(balance.adjustment, parseMoney('0')) !== 0)
  }
}
