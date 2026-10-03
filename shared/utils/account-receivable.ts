import { addMoney, compareMoney, moneyFromCents, moneyToCents, parseMoney, subtractMoney, sumMoney, type Money } from './money'

/**
 * Stable business identifier retained independently of the current Agreement title.
 * @param record - Retained Agreement reference and AR sequence.
 * @param record.egcs_fc_agreementnumber - Original Agreement business number.
 * @param record.egcs_fc_number - Independent AR sequence.
 * @returns The AR authoring reference.
 */
export const formatAccountReceivableReference = (record: { egcs_fc_agreementnumber: string; egcs_fc_number: number }): string =>
  `${record.egcs_fc_agreementnumber}-AR-${record.egcs_fc_number}`

/**
 * Stable manual Credit Memo authoring reference.
 * @param record - Retained Agreement reference and Credit Memo sequence.
 * @param record.egcs_fc_agreementnumber - Original Agreement business number.
 * @param record.egcs_fc_number - Independent manual Credit Memo sequence.
 * @returns The Credit Memo authoring reference.
 */
export const formatAccountReceivableCreditMemoReference = (record: { egcs_fc_agreementnumber: string; egcs_fc_number: number }): string =>
  `${record.egcs_fc_agreementnumber}-CM-${record.egcs_fc_number}`

export type AccountReceivableType = 'ineligible_expense' | 'outstanding_advance'
export type AccountReceivableRecoveryMethod = 'offset' | 'direct_repayment'

/**
 * Exact principal totals, distinct from the terminal establishment outcome.
 * @param principal - Effective approved principal including signed adjustments.
 * @param recovered - Successfully settled principal.
 * @param reserved - Principal held by unresolved Credit Memos.
 * @returns Positive balances and the derived collection state.
 */
export const calculateAccountReceivableBalance = (principal: Money, recovered: Money, reserved: Money) => {
  const zero = parseMoney('0.00')
  if (compareMoney(principal, zero) < 0 || compareMoney(recovered, zero) < 0 || compareMoney(reserved, zero) < 0
    || compareMoney(addMoney(recovered, reserved), principal) > 0) throw new Error('AR_PRINCIPAL_CAPACITY')
  const outstanding = subtractMoney(principal, recovered)
  return {
    egcs_fc_principal: principal,
    egcs_fc_recovered: recovered,
    egcs_fc_reserved: reserved,
    egcs_fc_outstanding: outstanding,
    egcs_fc_available: subtractMoney(outstanding, reserved),
    egcs_fc_collectionstate: compareMoney(outstanding, zero) === 0
      ? 'cleared' as const
      : compareMoney(recovered, zero) > 0 ? 'partially_recovered' as const : 'outstanding' as const
  }
}

export type AccountReceivablePriority = {
  id: string
  egcs_fc_fiscalyearorder: number
  egcs_fc_type: AccountReceivableType
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
  || Number(left.egcs_fc_type === 'ineligible_expense') - Number(right.egcs_fc_type === 'ineligible_expense')
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
 * Allocates exact signed principal cents over retained coding, respecting every capacity.
 * Stable coding identity receives cent remainders; saturated coding is removed and
 * the remainder redistributed using only the original eligible retained weights.
 * @param amount - Exact signed principal adjustment or positive settlement.
 * @param coding - Retained coding weights and positive eligible capacities.
 * @returns Every coding allocation, including explicit zeroes to reset draft values.
 */
export const allocateAccountReceivableCoding = (amount: Money, coding: readonly AccountReceivableCodingCapacity[]): Array<{ id: string; egcs_fc_amount: Money }> => {
  const signedTotal = moneyToCents(amount)
  const sign = signedTotal < BigInt(0) ? -BigInt(1) : BigInt(1)
  const total = signedTotal < BigInt(0) ? -signedTotal : signedTotal
  const ordered = [...coding].sort((left, right) => BigInt(left.id) < BigInt(right.id) ? -1 : BigInt(left.id) > BigInt(right.id) ? 1 : 0)
  if (new Set(ordered.map(line => line.id)).size !== ordered.length) throw new Error('AR_DUPLICATE_CODING')
  const rows = ordered.map(line => ({ id: line.id, weight: moneyToCents(line.egcs_fc_weight), capacity: moneyToCents(line.egcs_fc_capacity), allocated: BigInt(0) }))
  if (rows.some(line => line.weight < BigInt(0) || line.capacity < BigInt(0))) throw new Error('AR_CODING_CAPACITY')
  const eligibleCapacity = sumMoney(rows.filter(line => line.weight > BigInt(0)).map(line => moneyFromCents(line.capacity)))
  if (compareMoney(moneyFromCents(total), eligibleCapacity) > 0) throw new Error('AR_CODING_CAPACITY')
  let remaining = total
  while (remaining > BigInt(0)) {
    const eligible = rows.filter(line => line.weight > BigInt(0) && line.allocated < line.capacity)
    const weight = eligible.reduce((sum, line) => sum + line.weight, BigInt(0))
    if (weight === BigInt(0)) throw new Error('AR_CODING_CAPACITY')
    const saturated = eligible.filter(line => remaining * line.weight / weight > line.capacity - line.allocated)
    if (saturated.length) {
      for (const line of saturated) {
        const allocation = line.capacity - line.allocated
        line.allocated += allocation
        remaining -= allocation
      }
      continue
    }
    const roundAmount = remaining
    for (const line of eligible) {
      const allocation = roundAmount * line.weight / weight
      line.allocated += allocation
      remaining -= allocation
    }
    for (const line of eligible) {
      if (remaining === BigInt(0)) break
      if (line.allocated < line.capacity) {
        line.allocated += BigInt(1)
        remaining -= BigInt(1)
      }
    }
  }
  return rows.map(line => ({ id: line.id, egcs_fc_amount: moneyFromCents(line.allocated * sign) }))
}

/**
 * Canonical settlement reference shared by manual and automatic Credit Memos.
 * @param recoveryId - Immutable recovery execution identity.
 * @returns The canonical Credit Memo settlement reference.
 */
export const formatAccountReceivableCreditMemoSettlementReference = (recoveryId: string): string => `CM-${recoveryId}`
