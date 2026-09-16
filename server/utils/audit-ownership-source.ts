/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Raw connection reads are deliberately outside recursive audit capture. */
import { CompiledQuery, type DatabaseConnection } from 'kysely'
import { AUDIT_TABLE_OWNERSHIP, type AuditOwnershipRule } from '../database/audit-ownership-registry'
import type { AuditCreationOwner } from './audit-context'
import type { AuditOwnership, AuditOwnershipSource, AuditOwnershipRow } from './audit-ownership'

const encodeOwnership = (value: unknown): string => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? String(item) : item)

const quoteIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`

export const AUDIT_EFFECTIVE_REGISTRY_SQL = `
  WITH RECURSIVE registry AS (SELECT audit.ownership_registry() AS rules), ancestors(leaf, parent, depth) AS (
    SELECT n.nspname || '.' || c.relname, i.inhparent, 1 FROM pg_inherits i
      JOIN pg_class c ON c.oid=i.inhrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relispartition
    UNION ALL SELECT ancestors.leaf, i.inhparent, ancestors.depth+1 FROM ancestors
      JOIN pg_inherits i ON i.inhrelid=ancestors.parent WHERE ancestors.depth < 32
  ), inherited AS (
    SELECT DISTINCT ON (leaf) leaf, rules->(n.nspname || '.' || c.relname) AS rule
      FROM ancestors JOIN pg_class c ON c.oid=ancestors.parent JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN registry
      WHERE NOT rules ? leaf AND rules ? (n.nspname || '.' || c.relname) ORDER BY leaf, depth
  ) SELECT rules || coalesce((SELECT jsonb_object_agg(leaf,rule) FROM inherited),'{}'::jsonb) AS registry FROM registry`

/** One source per statement, using its raw connection and a shared actor-role snapshot. */
export const auditOwnershipSource = (connection: DatabaseConnection, actorUserId: string | null, registry: Readonly<Record<string, AuditOwnershipRule>> = AUDIT_TABLE_OWNERSHIP, creationOwner?: AuditCreationOwner): AuditOwnershipSource => {
  let effectiveRegistry = registry
  let registrySnapshot: Promise<Readonly<Record<string, AuditOwnershipRule>>> | undefined
  const getRegistry = () => registrySnapshot ??= connection.executeQuery<{ registry: Readonly<Record<string, AuditOwnershipRule>> }>(
    CompiledQuery.raw(AUDIT_EFFECTIVE_REGISTRY_SQL)
  ).then(result => {
    effectiveRegistry = result.rows[0]!.registry
    return effectiveRegistry
  })
  let actorSnapshot: Promise<readonly string[] | null> | undefined
  const readActorAgencies = async (): Promise<readonly string[] | null> => {
    if (!actorUserId) return null
    // Agency-scoped means no active program narrowing. A global role is not an agency grant.
    const result = await connection.executeQuery<{ agency_id: string }>(CompiledQuery.raw(`
      SELECT DISTINCT r.agency_id::text AS agency_id
      FROM public.user_role_assignment a
      JOIN public."user" u ON u.id = a.user_id AND NOT u._deleted
      JOIN public.role r ON r.id = a.role_id AND NOT r._deleted
      JOIN public."Agency_Profile" agency ON agency.id = r.agency_id AND NOT agency._deleted
      WHERE a.user_id = $1 AND NOT a._deleted
        AND NOT EXISTS (
          SELECT 1 FROM public.role_transfer_payment_scope p
          WHERE p.role_id = r.id AND NOT p._deleted
        )
      ORDER BY agency_id`, [actorUserId]))
    return result.rows.map(row => row.agency_id)
  }
  const resolutions = new Map<string, Promise<AuditOwnership>>()
  const resolve = (table: string, target: { row: AuditOwnershipRow } | { id: string }): Promise<AuditOwnership> => {
    const key = encodeOwnership([table, target])
    const previous = resolutions.get(key)
    if (previous) return previous
    const pending = (async (): Promise<AuditOwnership> => {
      const agencyIds = await (actorSnapshot ??= readActorAgencies())
      const snapshot = JSON.stringify({ actor: actorUserId, agencyIds })
      let rowExpression = '$2::jsonb'
      let parameter: string
      if ('row' in target) parameter = encodeOwnership(target.row)
      else {
        if (!Object.hasOwn(effectiveRegistry, table)) await getRegistry()
        if (!Object.hasOwn(effectiveRegistry, table)) return { type: 'unresolved', reason: 'unregistered_table' }
        const parts = table.split('.')
        if (parts.length !== 2) throw new Error('Invalid audit ownership lookup')
        rowExpression = `(SELECT to_jsonb(owner_row) FROM ${parts.map(quoteIdentifier).join('.')} owner_row WHERE id = $2)`
        parameter = target.id
      }
      const result = await connection.executeQuery<{ scope: AuditOwnership }>(CompiledQuery.raw(`
        WITH actor_snapshot AS MATERIALIZED (
          SELECT set_config('app.audit_actor_agencies', $3, true),
            set_config('app.audit_creation_owner', $5, true)
        ), ownership_row AS MATERIALIZED (SELECT ${rowExpression} AS value FROM actor_snapshot)
        SELECT CASE WHEN value IS NULL THEN jsonb_build_object('type','unresolved','reason','owner_missing_or_ambiguous')
          ELSE audit.resolve_ownership($1, value, $4) END AS scope FROM ownership_row`,
      [table, parameter, snapshot, actorUserId, creationOwner ? encodeOwnership(creationOwner) : '']))
      return result.rows[0]?.scope ?? { type: 'unresolved', reason: 'owner_missing_or_ambiguous' }
    })()
    resolutions.set(key, pending)
    return pending
  }
  return {
    registry,
    getRegistry,
    resolveRow: (table, row) => resolve(table, { row }),
    resolveIdentity: (table, id) => resolve(table, { id }),
    load: async (table, matches) => {
      if (!Object.hasOwn(effectiveRegistry, table)) await getRegistry()
      if (!Object.hasOwn(effectiveRegistry, table)) throw new Error(`Audit ownership table is not registered: ${table}`)
      const parts = table.split('.')
      if (parts.length !== 2 || Object.keys(matches).length === 0) throw new Error('Invalid audit ownership lookup')
      const conditions = Object.keys(matches).map((column, index) => `${quoteIdentifier(column)} = $${index + 1}`).join(' AND ')
      const result = await connection.executeQuery<AuditOwnershipRow>(CompiledQuery.raw(
        `SELECT * FROM ${parts.map(quoteIdentifier).join('.')} WHERE ${conditions} LIMIT 1001`,
        Object.values(matches)
      ))
      return result.rows
    },
    actorAgencyIds: () => actorSnapshot ??= readActorAgencies()
  }
}
