import { addMoney, compareMoney, parseMoney, zeroMoney, subtractMoney, sumMoney } from '~~/shared/utils/money'
import type { Money, MoneyInput } from '~~/shared/utils/money'

export type CorrectionFinancialBasis = {
  egcs_fc_commitmentamount: Money
  egcs_fc_originalpaid: Money
  egcs_fc_jveffect: Money
  egcs_fc_priorcorrections: Money
  egcs_fc_arrecoveries: Money
  egcs_fc_adjustment: Money
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
 * @param currency - Owning Correction denomination.
 * @returns Exact balances, or null while the input is invalid.
 */
export const correctionLineBalance = (line: CorrectionFinancialBasis, adjustment: MoneyInput, currency: string): CorrectionLineBalance | null => {
  try {
    const signedAdjustment = parseMoney(adjustment)
    const recordedPaid = sumMoney([line.egcs_fc_originalpaid, line.egcs_fc_jveffect, line.egcs_fc_priorcorrections, line.egcs_fc_arrecoveries], currency)
    const correctedPaid = addMoney(recordedPaid, signedAdjustment)
    const commitment = parseMoney(line.egcs_fc_commitmentamount)
    return {
      recordedPaid,
      adjustment: signedAdjustment,
      correctedPaid,
      remaining: subtractMoney(commitment, correctedPaid),
      withinCommitment: compareMoney(correctedPaid, zeroMoney(currency)) >= 0 && compareMoney(correctedPaid, commitment) <= 0
    }
  } catch {
    return null
  }
}

/**
 * Totals actual attribution rather than protective shared-coding floors.
 *
 * @param balances - Derived exact line balances.
 * @param currency - Owning Correction denomination.
 * @returns Exact totals, or null if any entered amount is invalid.
 */
export const correctionBalanceTotals = (balances: Array<CorrectionLineBalance | null>, currency: string) => {
  if (balances.some(balance => balance === null)) return null
  const valid = balances.filter((balance): balance is CorrectionLineBalance => balance !== null)
  return {
    recordedPaid: sumMoney(valid.map(balance => balance.recordedPaid), currency),
    adjustment: sumMoney(valid.map(balance => balance.adjustment), currency),
    correctedPaid: sumMoney(valid.map(balance => balance.correctedPaid), currency),
    remaining: sumMoney(valid.map(balance => balance.remaining), currency),
    hasAdjustments: valid.some(balance => compareMoney(balance.adjustment, zeroMoney(currency)) !== 0)
  }
}
