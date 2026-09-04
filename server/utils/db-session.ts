import { sql } from 'kysely'
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'

type DbLike = Kysely<Database> | Transaction<Database>

/**
 * Runs a callback inside a transaction with the acting application user exposed to database triggers.
 *
 * @param db - Root database connection.
 * @param userId - Authenticated application user ID.
 * @param callback - Transaction work to execute.
 * @returns Callback result.
 */
export const withAppUserDbSession = async <T>(
  db: Kysely<Database>,
  userId: string,
  callback: (trx: Transaction<Database>) => Promise<T>
): Promise<T> => {
  return await db.transaction().execute(async trx => {
    await sql`SELECT set_config('app.current_user_id', ${userId}, true)`.execute(trx)
    return await callback(trx)
  })
}

/**
 * Sets the acting application user for trigger-based auditing on the current DB scope.
 *
 * @param db - Root Kysely instance or a transaction.
 * @param userId - Authenticated application user ID.
 */
export const setAppUserDbSession = async (db: DbLike, userId: string): Promise<void> => {
  // Use transaction-local scope only inside a transaction; root connections need session scope.
  const isRootKysely = typeof (db as Kysely<Database>).transaction === 'function'
  const isLocal = !isRootKysely
  await sql`SELECT set_config('app.current_user_id', ${userId}, ${isLocal})`.execute(db)
}
