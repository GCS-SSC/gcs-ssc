import { validatePersistedMonetaryRows } from '../schema/currency-money'
import { hashPassword } from 'better-auth/crypto'
import { sql, type Kysely, type Migration } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { restoreNciaTemplateObjects } from '../ncia-template-objects'
import { seedGuidedHelpExample } from '../guided-help-seed'
import { seedFieldTooltipExamples } from '../field-tooltip-seed'
import { initializeCatalogCacheRevisions } from '../catalog-cache-revisions'
import { seedNotificationDemo } from '../notification-demo-seed'
import { upgradeNciaGaRiskAssessment } from '../ncia-ga-risk-assessment'

type DemoSnapshot = Record<string, Array<Record<string, unknown>>> & { user: Array<{ id: string | number }> }

interface ForeignKey {
  table_name: string
  constraint_name: string
}

// The curated snapshot includes captured casework and authored approval evidence.
// Restoring it through authoring triggers would duplicate Entity/Publication identities.
export const restoreDemoSnapshot = async <DB>(db: Kysely<DB>, snapshot: DemoSnapshot): Promise<void> => {
  const tables = Object.entries(snapshot)
  const foreignKeys = await sql<ForeignKey>`
    SELECT conrelid::regclass::text AS table_name, conname AS constraint_name
    FROM pg_constraint
    WHERE contype = 'f' AND NOT condeferrable
      AND conrelid IN (SELECT oid FROM pg_class WHERE oid = ANY(
        ${tables.map(([table]) => table.includes('.') ? table : `"${table}"`)}::regclass[]
      ))
  `.execute(db)

  for (const foreignKey of foreignKeys.rows) {
    await sql`ALTER TABLE ${sql.raw(foreignKey.table_name)}
      ALTER CONSTRAINT ${sql.id(foreignKey.constraint_name)} DEFERRABLE INITIALLY DEFERRED`.execute(db)
  }
  await sql`SET CONSTRAINTS ALL DEFERRED`.execute(db)
  for (const [table] of tables) {
    await sql`ALTER TABLE ${sql.id(...table.split('.'))} DISABLE TRIGGER USER`.execute(db)
  }
  for (const [table, rows] of tables) {
    const identifier = sql.id(...table.split('.'))
    const columns = sql.join(Object.keys(rows[0]!).map(column => sql.id(column)))
    await sql`INSERT INTO ${identifier} (${columns})
      SELECT ${columns} FROM jsonb_populate_recordset(NULL::${identifier}, ${JSON.stringify(rows)}::jsonb)`.execute(db)
  }

  // Never copy deployed account hashes, sessions or extension secrets.
  const password = await hashPassword('password123')
  for (const user of snapshot.user) {
    await sql`INSERT INTO account
      (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      VALUES (${`ncia-demo-${user.id}`}, ${String(user.id)}, 'credential', ${user.id},
        ${password}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`.execute(db)
  }

  // Force every foreign-key check before restoring the schema's original timing.
  await sql`SET CONSTRAINTS ALL IMMEDIATE`.execute(db)
  for (const [table, rows] of tables) {
    await sql`ALTER TABLE ${sql.id(...table.split('.'))} ENABLE TRIGGER USER`.execute(db)
    if (!Object.hasOwn(rows[0]!, 'id')) continue
    const sequence = await sql<{ name: string | null }>`
      SELECT pg_get_serial_sequence(${table.includes('.') ? table : `"${table}"`}, 'id') AS name
    `.execute(db)
    const sequenceName = sequence.rows[0]?.name
    if (sequenceName) {
      await sql`SELECT setval(${sequenceName}::regclass,
        (SELECT max(id) FROM ${sql.id(...table.split('.'))}), true)`.execute(db)
    }
  }
  for (const foreignKey of foreignKeys.rows) {
    await sql`ALTER TABLE ${sql.raw(foreignKey.table_name)}
      ALTER CONSTRAINT ${sql.id(foreignKey.constraint_name)} NOT DEFERRABLE INITIALLY IMMEDIATE`.execute(db)
  }
  await restoreNciaTemplateObjects(db as unknown as Kysely<Database>)
  // Publication state and transition history are validated together at the end of the seed.
  await sql`SET CONSTRAINTS ALL DEFERRED`.execute(db)
  if (!snapshot.Common_Guided_Help?.length) {
    await seedGuidedHelpExample(db as unknown as import('kysely').Transaction<Database>)
  }
  await seedFieldTooltipExamples(db as unknown as import('kysely').Transaction<Database>)
  await sql`SET CONSTRAINTS ALL IMMEDIATE`.execute(db)
  await initializeCatalogCacheRevisions(db)
  await seedNotificationDemo(db as unknown as Kysely<Database>)
  await upgradeNciaGaRiskAssessment(db as unknown as Kysely<Database>)
  await validatePersistedMonetaryRows(db)
}

export const up: Migration['up'] = async db => {
  // One coherent snapshot includes NCIA, Maple and Health Canada, including publications.
  const { default: snapshot } = await import('../seeds/demo.json' as string) as { default: DemoSnapshot }
  if (db.isTransaction) await restoreDemoSnapshot(db, snapshot)
  else await db.transaction().execute(transaction => restoreDemoSnapshot(transaction, snapshot))
}
