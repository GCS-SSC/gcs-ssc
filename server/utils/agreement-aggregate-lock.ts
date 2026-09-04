import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'

export type AgreementAggregateType = 'claim' | 'claimReconcile' | 'commitment' | 'forecast' | 'monitor'
export type AgreementAggregateLock = {
  type: AgreementAggregateType
  id: string
}

/**
 * Locks an aggregate root so lifecycle changes and child writes serialize.
 *
 * @param trx - Active transaction.
 * @param aggregateType - Aggregate table selector.
 * @param aggregateId - Aggregate identifier.
 * @param agreementId - Optional owning agreement identifier.
 * @returns Whether the aggregate exists.
 */
export const lockAgreementAggregate = async (
  trx: Transaction<Database>,
  aggregateType: AgreementAggregateType,
  aggregateId: string,
  agreementId?: string
): Promise<boolean> => {
  if (aggregateType === 'claim') {
    let query = trx.selectFrom('Funding_Case_Agreement_Claim').select('id').where('id', '=', aggregateId)
    if (agreementId) query = query.where('egcs_fc_fundingagreement', '=', agreementId)
    const row = await query.forUpdate().executeTakeFirst()
    return Boolean(row)
  }
  if (aggregateType === 'claimReconcile') {
    let query = trx.selectFrom('Funding_Case_Agreement_Claim_Reconcile').select('id').where('id', '=', aggregateId)
    if (agreementId) {
      query = query.where(({ exists, selectFrom }) => exists(
        selectFrom('Funding_Case_Agreement_Claim')
          .select('id')
          .whereRef('Funding_Case_Agreement_Claim.id', '=', 'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim')
          .where('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement', '=', agreementId)
          .where('Funding_Case_Agreement_Claim._deleted', '=', false)
      ))
    }
    const row = await query.forUpdate().executeTakeFirst()
    return Boolean(row)
  }
  if (aggregateType === 'commitment') {
    let query = trx.selectFrom('Funding_Case_Agreement_Commitment').select('id').where('id', '=', aggregateId)
    if (agreementId) query = query.where('egcs_fc_fundingagreement', '=', agreementId)
    const row = await query.forUpdate().executeTakeFirst()
    return Boolean(row)
  }
  if (aggregateType === 'forecast') {
    let query = trx.selectFrom('Funding_Case_Agreement_Forecast').select('id').where('id', '=', aggregateId)
    if (agreementId) query = query.where('egcs_fc_fundingagreement', '=', agreementId)
    const row = await query.forUpdate().executeTakeFirst()
    return Boolean(row)
  }

  let query = trx.selectFrom('Funding_Case_Agreement_Monitor').select('id').where('id', '=', aggregateId)
  if (agreementId) query = query.where('egcs_fc_fundingagreement', '=', agreementId)
  const row = await query.forUpdate().executeTakeFirst()
  return Boolean(row)
}

const AGGREGATE_LOCK_ORDER: Record<AgreementAggregateType, number> = {
  claim: 0,
  claimReconcile: 1,
  commitment: 2,
  forecast: 3,
  monitor: 4
}

/**
 * Compares decimal bigint identifiers without lexical or numeric precision loss.
 *
 * @param left - First bigint identifier.
 * @param right - Second bigint identifier.
 * @returns Negative, positive, or zero according to numeric order.
 */
const compareBigintIds = (left: string, right: string): number => {
  const leftId = BigInt(left)
  const rightId = BigInt(right)
  if (leftId < rightId) return -1
  if (leftId > rightId) return 1
  return 0
}

/**
 * Locks aggregate roots in one deterministic order.
 *
 * @param trx - Active transaction.
 * @param locks - Aggregate identifiers to lock.
 * @param agreementId - Optional owning agreement identifier.
 * @returns Whether every aggregate exists.
 */
export const lockAgreementAggregates = async (
  trx: Transaction<Database>,
  locks: AgreementAggregateLock[],
  agreementId?: string
): Promise<boolean> => {
  const orderedLocks = [...new Map(locks.map(lock => [`${lock.type}:${lock.id}`, lock])).values()]
    .sort((left, right) => AGGREGATE_LOCK_ORDER[left.type] - AGGREGATE_LOCK_ORDER[right.type]
      || compareBigintIds(left.id, right.id))

  for (const lock of orderedLocks) {
    if (!await lockAgreementAggregate(trx, lock.type, lock.id, agreementId)) {
      return false
    }
  }

  return true
}
