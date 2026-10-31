import { absMoney, addMoney, allocateMoney, compareMoney, negateMoney, parseDecimalText, subtractMoney, sumMoney, zeroMoney, type Money } from './money'

export type AccountReceivableRecoveryMethod = 'offset' | 'direct_repayment'

export type AccountReceivablePriority = {
  id: string
  egcs_fc_fiscalyearorder: number
  egcs_fc_advancepaymentrelated: boolean
  egcs_fc_postedat: string
  egcs_fc_periodstart: number
  egcs_fc_lineid: string
}

/**
 * Canonical oldest-year, advance-first, establishment-date, source-period priority.
 * @param left - Left original AR source line.
 * @param right - Right original AR source line.
 * @returns Stable priority order.
 */
export const compareAccountReceivablePriority = (left: AccountReceivablePriority, right: AccountReceivablePriority): number =>
  left.egcs_fc_fiscalyearorder - right.egcs_fc_fiscalyearorder
  || Number(!left.egcs_fc_advancepaymentrelated) - Number(!right.egcs_fc_advancepaymentrelated)
  || left.egcs_fc_postedat.localeCompare(right.egcs_fc_postedat)
  || (BigInt(left.id) < BigInt(right.id) ? -1 : BigInt(left.id) > BigInt(right.id) ? 1 : 0)
  || left.egcs_fc_periodstart - right.egcs_fc_periodstart
  || (BigInt(left.egcs_fc_lineid) < BigInt(right.egcs_fc_lineid) ? -1 : BigInt(left.egcs_fc_lineid) > BigInt(right.egcs_fc_lineid) ? 1 : 0)

export type AccountReceivableCodingCapacity = {
  id: string
  egcs_fc_weight: Money
  egcs_fc_capacity: Money
}

/**
 * Allocates exact signed principal minor units over retained coding, respecting every capacity.
 * Stable coding identity receives minor-unit remainders; saturated coding is removed and
 * the remainder redistributed using only the original eligible retained weights.
 * @param amount - Exact signed principal adjustment or positive settlement.
 * @param coding - Retained coding weights and positive eligible capacities.
 * @param currency - Owning denomination.
 * @returns Every coding allocation, including explicit zeroes to reset draft values.
 */
export const allocateAccountReceivableCoding = (amount: Money, coding: readonly AccountReceivableCodingCapacity[], currency: string): Array<{ id: string; egcs_fc_amount: Money }> => {
  const zero = zeroMoney(currency)
  const negative = compareMoney(amount, zero) < 0
  const total = absMoney(amount)
  const ordered = [...coding].sort((left, right) => BigInt(left.id) < BigInt(right.id) ? -1 : BigInt(left.id) > BigInt(right.id) ? 1 : 0)
  if (new Set(ordered.map(line => line.id)).size !== ordered.length) throw new Error('AR_DUPLICATE_CODING')
  const rows = ordered.map(line => ({ id: line.id, weight: line.egcs_fc_weight, capacity: line.egcs_fc_capacity, allocated: zero }))
  if (rows.some(line => compareMoney(line.weight, zero) < 0 || compareMoney(line.capacity, zero) < 0)) throw new Error('AR_CODING_CAPACITY')
  const eligibleCapacity = sumMoney(rows.filter(line => compareMoney(line.weight, zero) > 0).map(line => line.capacity), currency)
  if (compareMoney(total, eligibleCapacity) > 0) throw new Error('AR_CODING_CAPACITY')
  let remaining = total
  while (compareMoney(remaining, zero) > 0) {
    const eligible = rows.filter(line => compareMoney(line.weight, zero) > 0 && compareMoney(line.allocated, line.capacity) < 0)
    if (!eligible.length) throw new Error('AR_CODING_CAPACITY')
    const shares = allocateMoney(remaining, eligible.map(line => parseDecimalText(line.weight.amount)), { method: 'ordered' })
    const saturated = eligible.filter((line, index) => compareMoney(shares[index]!, subtractMoney(line.capacity, line.allocated)) > 0)
    if (saturated.length) {
      for (const line of saturated) {
        const allocation = subtractMoney(line.capacity, line.allocated)
        line.allocated = addMoney(line.allocated, allocation)
        remaining = subtractMoney(remaining, allocation)
      }
      continue
    }
    for (const [index, line] of eligible.entries()) line.allocated = addMoney(line.allocated, shares[index]!)
    remaining = zero
  }
  return rows.map(line => ({ id: line.id, egcs_fc_amount: negative ? negateMoney(line.allocated) : line.allocated }))
}
