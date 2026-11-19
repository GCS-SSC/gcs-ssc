import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'

/**
 * Loads the globally enabled extension keys for startup and discovery.
 * @param db - The host database.
 * @returns The registered keys with enabled records.
 */
export const listEnabledSystemExtensionKeys = async (db: Kysely<Database>): Promise<Set<string>> => {
  const rows = await db.selectFrom('extensions.system_enablement')
    .select('extension_key')
    .where('enabled', '=', true)
    .execute()
  return new Set(rows.map(row => row.extension_key))
}

/**
 * Coordinates route admission (shared) and enablement mutations (exclusive).
 * @param db - The transaction that holds the lock until settlement.
 * @param extensionKey - The installed system extension key.
 * @param mode - Shared for dispatch and exclusive for changes to enablement.
 */
export const lockSystemExtension = async (
  db: Transaction<Database>,
  extensionKey: string,
  mode: 'shared' | 'exclusive'
): Promise<void> => {
  const key = `gcs-extension-lifecycle:${extensionKey}:system`
  const lock = mode === 'shared' ? sql`pg_advisory_xact_lock_shared` : sql`pg_advisory_xact_lock`
  await sql`select ${lock}(hashtextextended(${key}, 0))`.execute(db)
}
