import { sql, type Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { AUDIT_ACCESS_TABLE_NAMES, AUDIT_TABLE_NAMES } from '~~/shared/utils/audit-table-options'
import { AUDIT_SECURITY_TARGET_TABLES } from '../database/audit-ownership-registry'

/**
 * Lists installed extension tables without importing extension implementation catalogs.
 * @param db Business database containing capture policies.
 * @returns Complete choices for the change/security and access browsers.
 */
export const listAuditTableOptions = async (db: Kysely<Database>): Promise<{ events: string[]; access: string[] }> => {
  const installed = await sql<{ table_name: string }>`
    SELECT p.table_schema || '.' || p.table_name AS table_name
    FROM audit.capture_policy p
    JOIN pg_namespace n ON n.nspname = p.table_schema
    JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = p.table_name
    WHERE p.table_schema = 'extensions' AND c.relkind IN ('r', 'p') AND p.enabled
  `.execute(db)
  const extensionTables = installed.rows.map(row => row.table_name)
  return {
    events: [...new Set([...AUDIT_TABLE_NAMES, ...extensionTables, ...Object.keys(AUDIT_SECURITY_TARGET_TABLES)])].sort(),
    access: [...new Set([...AUDIT_ACCESS_TABLE_NAMES, ...extensionTables])].sort()
  }
}
