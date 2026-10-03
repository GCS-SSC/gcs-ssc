import { sql, type Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'

/**
 * Allows historical seed migrations to call evolving accounting helpers before incremental schema installation.
 * @param db - The migration or caller's active database connection.
 * @param table - An explicitly supported accounting aggregate.
 * @returns Whether the table exists in the current transaction's schema.
 */
export const hasAccountingTable = async (
  db: Kysely<Database>, table: 'Funding_Case_Agreement_Correction' | 'Funding_Case_Agreement_Journal_Voucher' | 'Funding_Case_Agreement_Account_Receivable' | 'Funding_Case_Account_Receivable_Pool' | 'Funding_Case_Account_Receivable_Posting'
): Promise<boolean> => {
  const result = await sql<{ installed: boolean }>`SELECT to_regclass(${`public."${table}"`}) IS NOT NULL AS installed`.execute(db)
  return result.rows[0]?.installed === true
}

/**
 * Tests the ordered Correction migration boundary without caching a pre-upgrade absence.
 * @param db - Active caller database or migration transaction.
 * @returns Whether Corrections have been installed.
 */
export const hasCorrectionSchema = async (db: Kysely<Database>): Promise<boolean> =>
  await hasAccountingTable(db, 'Funding_Case_Agreement_Correction')
