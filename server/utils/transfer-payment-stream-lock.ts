import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'

/**
 * Locks active transfer-payment streams in a deterministic order.
 *
 * @param trx - Transaction that owns the row locks.
 * @param streamIds - Transfer-payment stream identifiers to lock.
 * @returns Identifiers of active streams whose rows were locked.
 */
export const lockTransferPaymentStreams = async (
  trx: Transaction<Database>,
  streamIds: string[]
): Promise<Set<string>> => {
  const orderedStreamIds = [...new Set(streamIds)].sort((left, right) => left.localeCompare(right))
  if (orderedStreamIds.length === 0) {
    return new Set()
  }

  const rows = await trx
    .selectFrom('Transfer_Payment_Stream')
    .select('id')
    .where('id', 'in', orderedStreamIds)
    .where('_deleted', '=', false)
    .orderBy('id', 'asc')
    .forUpdate('Transfer_Payment_Stream')
    .execute()

  return new Set(rows.map(row => String(row.id)))
}
