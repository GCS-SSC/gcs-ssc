import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { requireAuthContext, requireFreshAuthContext } from './authorize'

/**
 * Runs a read projection against one freshly authorized repeatable-read snapshot.
 * @param event Active request event.
 * @param callback Projection executed with the stable transaction.
 * @returns The callback result.
 */
export const executeFreshReadSnapshot = async <T>(
  event: H3Event,
  callback: (trx: Transaction<Database>) => Promise<T>
): Promise<T> => {
  const database = event.context.$db
  if (typeof database.transaction !== 'function' || database.isTransaction) {
    return await callback(database as unknown as Transaction<Database>)
  }
  await requireAuthContext(event)
  const transaction = database.transaction()
  const transactionBuilder = typeof transaction.setIsolationLevel === 'function'
    ? transaction.setIsolationLevel('repeatable read')
    : transaction
  return await transactionBuilder.execute(async trx => {
    const freshAuthContext = await requireFreshAuthContext(event, trx)
    const requestAuthContext = event.context.$authContext
    event.context.$db = trx
    event.context.$authContext = freshAuthContext
    try {
      return await callback(trx)
    } finally {
      event.context.$db = database
      event.context.$authContext = requestAuthContext
    }
  })
}
