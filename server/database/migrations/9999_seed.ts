import { hashPassword } from 'better-auth/crypto'
import { sql, type Kysely, type Migration } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { restoreNciaTemplateObjects } from '../ncia-template-objects'

type DemoSnapshot = Record<string, Array<Record<string, unknown>>> & { user: Array<{ id: number }> }

interface ForeignKey {
  table_name: string
  constraint_name: string
}

// The curated snapshot includes captured casework and authored approval evidence.
// Restoring it through authoring triggers would duplicate Entity/Publication identities.
const restoreSnapshot = async <DB>(db: Kysely<DB>): Promise<void> => {
  // Keep the captured JSON opaque to TypeScript while bundling it into demo.mjs.
  const { default: snapshot } = await import('../seeds/ncia-demo.json' as string) as { default: DemoSnapshot }
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
  for (const [table] of tables) {
    await sql`ALTER TABLE ${sql.id(...table.split('.'))} ENABLE TRIGGER USER`.execute(db)
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
}

export const up: Migration['up'] = async db => {
  if (db.isTransaction) {
    await restoreSnapshot(db)
  } else {
    await db.transaction().execute(restoreSnapshot)
  }
}
