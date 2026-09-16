/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param -- Extension ownership is a validated data-only SDK contribution. */
import { defineGcsAuditOwnership, type GcsAuditOwnershipRule, type GcsAuditTableOwnership } from '@gcs-ssc/extensions'
import { sql, type Kysely } from 'kysely'
import { AUDIT_TABLE_OWNERSHIP, type AuditOwnershipRule } from './audit-ownership-registry'
import { installAuditOwnershipFunctions } from './audit-ownership-functions'
import type { Database } from '../../shared/types/database'

const anchors = {
  agency: 'public.Agency_Profile', program: 'public.Transfer_Payment_Profile',
  stream: 'public.Transfer_Payment_Stream', agreement: 'public.Funding_Case_Agreement_Profile',
  proponent: 'public.Applicant_Recipient_Profile'
} as const

const compileRule = (rule: GcsAuditOwnershipRule): AuditOwnershipRule => {
  if (rule.kind === 'owner') return { kind: 'parent', table: anchors[rule.owner], column: rule.column, targetColumn: 'id' }
  if (rule.kind === 'parent') return { ...rule, targetColumn: rule.targetColumn ?? 'id' }
  if (rule.kind === 'switch') return { ...rule, cases: Object.fromEntries(Object.entries(rule.cases).map(([key, value]) => [key, compileRule(value)])) }
  return rule
}

export const mergeExtensionAuditOwnership = (
  extensions: readonly { key: string; auditOwnership?: readonly GcsAuditTableOwnership[] }[]
): Readonly<Record<string, AuditOwnershipRule>> => {
  const registry: Record<string, AuditOwnershipRule> = { ...AUDIT_TABLE_OWNERSHIP }
  const owners = new Map<string, string>()
  for (const extension of extensions) {
    for (const declaration of defineGcsAuditOwnership(extension.auditOwnership ?? [])) {
      if (Object.hasOwn(registry, declaration.table)) throw new Error(`Duplicate or reserved audit ownership table: ${declaration.table}`)
      owners.set(declaration.table, extension.key)
      registry[declaration.table] = compileRule(declaration.owner)
    }
  }
  const verify = (table: string, rule: AuditOwnershipRule, extensionKey: string, seen: readonly string[]): void => {
    if (rule.kind === 'switch') {
      for (const variant of Object.values(rule.cases)) verify(table, variant, extensionKey, seen)
    } else if (rule.kind === 'parent' && rule.table.startsWith('extensions.')) {
      if (owners.get(rule.table) !== extensionKey) throw new Error(`Audit ownership parent must be declared by the same extension: ${table}`)
      if (seen.includes(rule.table)) throw new Error(`Cyclic extension audit ownership: ${table}`)
      verify(table, registry[rule.table]!, extensionKey, [...seen, rule.table])
    }
  }
  for (const [table, extensionKey] of owners) verify(table, registry[table]!, extensionKey, [table])
  return Object.freeze(registry)
}

/** Publish only declarations whose extension schema has successfully migrated in this transaction. */
export const publishExtensionAuditOwnership = async (
  db: Kysely<Database>,
  extension: { key: string; auditOwnership?: readonly GcsAuditTableOwnership[] }
): Promise<void> => {
  if (!db.isTransaction) throw new Error('Audit ownership publication requires the extension migration transaction')
  const installed = await sql<{ installed: string | null }>`SELECT to_regprocedure('audit.ownership_registry()')::text AS installed`.execute(db)
  // The host can run pre-audit extension migrations during an incremental core upgrade.
  if (!installed.rows[0]?.installed) return
  await sql`SELECT pg_advisory_xact_lock(hashtextextended('gcs.audit.ownership.publication',0))`.execute(db)
  const metadata = await sql<{ installed: string | null }>`SELECT to_regprocedure('audit.installed_extension_ownership()')::text AS installed`.execute(db)
  const previous = metadata.rows[0]?.installed
    ? (await sql<{ declarations: Record<string, GcsAuditTableOwnership[]> }>`SELECT audit.installed_extension_ownership() AS declarations`.execute(db)).rows[0]!.declarations
    : {}
  const declarations = { ...previous, [extension.key]: defineGcsAuditOwnership(extension.auditOwnership ?? []) }
  const registry = mergeExtensionAuditOwnership(Object.entries(declarations).map(([key, auditOwnership]) => ({ key, auditOwnership })))
  await installAuditOwnershipFunctions(db, registry)
  const quote = (value: string) => `'${value.replaceAll('\'', '\'\'')}'`
  const body = `SELECT ${quote(JSON.stringify(declarations))}::jsonb`
  await sql.raw(`CREATE OR REPLACE FUNCTION audit.installed_extension_ownership() RETURNS jsonb
    LANGUAGE sql IMMUTABLE AS ${quote(body)}`).execute(db)
}
