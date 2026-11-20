import { validatePersistedMonetaryRows } from '../schema/currency-money'
import { hashPassword } from 'better-auth/crypto'
import { sql, type Kysely, type Migration, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { restoreNciaTemplateObjects } from '../ncia-template-objects'
import { seedGuidedHelpExample } from '../guided-help-seed'
import { seedFieldTooltipExamples } from '../field-tooltip-seed'
import { initializeCatalogCacheRevisions } from '../catalog-cache-revisions'
import { seedNotificationDemo } from '../notification-demo-seed'
import { upgradeNciaGaRiskAssessment } from '../ncia-ga-risk-assessment'
import { seedReviewCopyDemo } from '../review-copy-demo-seed'
import { seedHealthCanadaCatalogs } from '../health-canada-catalog-seed'
import { seedHealthCanadaClauses } from '../health-canada-clause-seed'

type DemoSnapshot = Record<string, Array<Record<string, unknown>>> & { user: Array<{ id: string | number }> }

interface ForeignKey {
  table_name: string
  constraint_name: string
}

/**
 * Adds a reusable Health Canada testing cohort to the curated demo identities.
 * @param snapshot The curated demo rows.
 * @returns The snapshot with the additional demo users and role assignments.
 */
const addHealthCanadaTestUsers = (snapshot: DemoSnapshot): DemoSnapshot => {
  const officer = snapshot.user.find(user => 'email' in user && user.email === 'hc.officer5@example.com')
  const commonUsers = snapshot.Common_User ?? []
  const assignments = snapshot.user_role_assignment ?? []
  const officerIdentity = commonUsers.find(user => user.egcs_cn_authuserid === officer?.id && user._deleted === false)
  const healthCanadaRoles = new Set((snapshot.role ?? [])
    .filter(role => role.agency_id === '30021' && role._deleted === false).map(role => role.id))
  const officerRoles = assignments.filter(assignment => assignment.user_id === officer?.id && assignment._deleted === false
    && healthCanadaRoles.has(assignment.role_id))
  if (!officer || !officerIdentity || !officerRoles.length) throw new Error('Health Canada demo officer roles are missing')

  const nextId = (rows: Array<Record<string, unknown>>) => {
    let id = rows.reduce((max, row) => {
      const candidate = BigInt(String(row.id))
      return candidate > max ? candidate : max
    }, BigInt(0))
    return () => String(++id)
  }
  const nextUserId = nextId(snapshot.user)
  const nextCommonUserId = nextId(commonUsers)
  const nextAssignmentId = nextId(assignments)
  const users = Array.from({ length: 30 }, (_, index) => {
    const suffix = String(index + 1).padStart(2, '0')
    return { ...officer, id: nextUserId(), name: `Health Canada Test ${suffix}`, email: `hc.test${suffix}@example.test` }
  })
  return {
    ...snapshot,
    user: [...snapshot.user, ...users],
    Common_User: [...commonUsers, ...users.map(user => ({
      ...officerIdentity, id: nextCommonUserId(), egcs_cn_authuserid: user.id, egcs_cn_name: user.name, egcs_cn_email: user.email
    }))],
    user_role_assignment: [...assignments, ...users.flatMap(user => officerRoles.map(role => ({
      ...role, id: nextAssignmentId(), user_id: user.id
    })))]
  }
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
  const seed = async (transaction: Transaction<unknown>) => {
    await restoreDemoSnapshot(transaction, addHealthCanadaTestUsers(snapshot))
    const demo = transaction as unknown as Transaction<Database>
    await seedReviewCopyDemo(demo)
    await seedHealthCanadaCatalogs(demo)
    await seedHealthCanadaClauses(demo)
  }
  if (db.isTransaction) await seed(db as Transaction<unknown>)
  else await db.transaction().execute(seed)
}
