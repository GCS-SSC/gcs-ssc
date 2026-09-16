/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Resolver contracts are explicit and shared by adapters. */
import { AUDIT_ENTITY_TABLES, AUDIT_TABLE_OWNERSHIP, type AuditOwnershipRule } from '../database/audit-ownership-registry'

export type AuditOwnershipRow = Readonly<Record<string, unknown>>
export type AuditOwnership =
  | { type: 'agency'; agencyIds: string[] }
  | { type: 'global'; reason: string }
  | { type: 'unresolved'; reason: string }

export type AuditOwnershipSource = {
  /** Explicit internal startup reconciliation, never inferred from a missing actor. */
  maintenance?: boolean
  /** Database-backed entry points avoid one network round trip per ownership hop. */
  resolveRow?: (table: string, row: AuditOwnershipRow) => Promise<AuditOwnership>
  resolveIdentity?: (table: string, id: string) => Promise<AuditOwnership>
  registry?: Readonly<Record<string, AuditOwnershipRule>>
  /** Read installed declarations in the executing transaction rather than a process cache. */
  getRegistry?: () => Promise<Readonly<Record<string, AuditOwnershipRule>>>
  /** Must read from the executing transaction/connection, with no cross-statement row cache. */
  load: (table: string, matches: Readonly<Record<string, string>>) => Promise<readonly AuditOwnershipRow[]>
  /** null means no actor; [] means an actor with no active agency-scoped roles. */
  actorAgencyIds: () => Promise<readonly string[] | null>
}
const identity = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'bigint' || (typeof value === 'number' && Number.isSafeInteger(value))) return String(value)
  return undefined
}
const unresolved = (reason: string): AuditOwnership => ({ type: 'unresolved', reason })

/** One resolver instance per SQL statement: only duplicate lookups inside that statement are shared. */
export const createAuditOwnershipResolver = (source: AuditOwnershipSource) => {
  const registry = source.registry ?? AUDIT_TABLE_OWNERSHIP
  const loads = new Map<string, Promise<readonly AuditOwnershipRow[]>>()
  let actorAgencies: Promise<readonly string[] | null> | undefined
  const load = (table: string, matches: Readonly<Record<string, string>>) => {
    const key = JSON.stringify([table, matches])
    let pending = loads.get(key)
    if (!pending) {
      pending = source.load(table, matches)
      loads.set(key, pending)
    }
    return pending
  }
  const resolveLoaded = async (table: string, matches: Readonly<Record<string, string>>, path: readonly string[]): Promise<AuditOwnership> => {
    const key = JSON.stringify([table, matches])
    if (path.includes(key) || path.length >= 32) return unresolved('ownership_cycle')
    const rows = await load(table, matches)
    if (rows.length !== 1 || !rows[0]) return unresolved('owner_missing_or_ambiguous')
    return await resolveRow(table, rows[0], [...path, key])
  }
  const resolveRule = async (rule: AuditOwnershipRule, row: AuditOwnershipRow, path: readonly string[]): Promise<AuditOwnership> => {
    switch (rule.kind) {
      case 'stored-audience': {
        if (row.scope_type === 'historical' || row.scope_type === 'global') return { type: 'global', reason: 'Persisted event audience' }
        if (row.scope_type === 'agency' && Array.isArray(row.agency_ids) && row.agency_ids.length > 0) {
          const ids = row.agency_ids.map(identity)
          if (ids.every((id): id is string => id !== undefined)) return { type: 'agency', agencyIds: [...new Set(ids)].sort() }
        }
        return unresolved('stored_event_audience_unavailable')
      }
      case 'global': return { type: 'global', reason: rule.reason }
      case 'agency': {
        const agencyId = identity(row[rule.column])
        return agencyId ? { type: 'agency', agencyIds: [agencyId] } : unresolved('agency_missing')
      }
      case 'actor-agencies': {
        const ids = await (actorAgencies ??= source.actorAgencyIds())
        if (ids === null && rule.whenActorMissing === 'maintenance-global' && source.maintenance) {
          return { type: 'global', reason: 'Actorless audit configuration maintenance' }
        }
        if (ids === null) return rule.whenActorMissing === 'global'
          ? { type: 'global', reason: 'Actorless authentication verification' }
          : unresolved('role_audience_actor_missing')
        return ids.length > 0
          ? { type: 'agency', agencyIds: [...new Set(ids)].sort() }
          : { type: 'global', reason: 'Actor has no active agency-scoped roles' }
      }
      case 'parent': {
        const id = identity(row[rule.column])
        return id ? await resolveLoaded(rule.table, { [rule.targetColumn]: id }, path) : unresolved('parent_key_missing')
      }
      case 'encoded-entity': {
        const dimension = identity(row[rule.dimensionColumn])
        const parts = identity(row[rule.column])?.split(':')
        if (!dimension || !parts || parts.length !== rule.segments[dimension] || parts.some(part => !part)) {
          return unresolved('ownership_key_invalid')
        }
        return await resolveRule({ kind: 'entity', idColumn: 'id', typeColumn: 'type' }, { id: parts[1], type: parts[0] }, path)
      }
      case 'entity': {
        const id = identity(row[rule.idColumn])
        const type = identity(row[rule.typeColumn])
        if (!id || !type) return unresolved('entity_key_missing')
        const table = Object.hasOwn(AUDIT_ENTITY_TABLES, type) ? AUDIT_ENTITY_TABLES[type] : undefined
        if (table) return await resolveLoaded(table, { id }, path)
        // Installed lifecycle types declare their typed owner in the host identity contract.
        return await resolveLoaded('public.Common_Extension_Entity_Owner', {
          egcs_cn_entityid: id, egcs_cn_entitytype: type
        }, path)
      }
      case 'switch': {
        const discriminator = identity(row[rule.column])
        const selected = discriminator ? rule.cases[discriminator] : undefined
        return selected ? await resolveRule(selected, row, path) : unresolved('ownership_variant_missing')
      }
      case 'references': {
        const id = identity(row.id)
        if (!id) return unresolved('shared_record_key_missing')
        const agencies = new Set<string>()
        let globalReason: string | undefined
        for (const link of rule.links) {
          const key = JSON.stringify([link.table, { [link.column]: id }])
          if (path.includes(key) || path.length >= 32) return unresolved('ownership_cycle')
          const owners = await load(link.table, { [link.column]: id })
          if (owners.length > 1000) return unresolved('ownership_fanout_limit')
          for (const owner of owners) {
            const scope = await resolveRow(link.table, owner, [...path, key])
            if (scope.type === 'unresolved') return scope
            if (scope.type === 'global') globalReason = scope.reason
            else for (const agencyId of scope.agencyIds) agencies.add(agencyId)
          }
        }
        // A shared row with any global owner cannot be exposed through another owner's agency.
        if (globalReason) return { type: 'global', reason: globalReason }
        return agencies.size > 0
          ? { type: 'agency', agencyIds: [...agencies].sort() }
          : unresolved('shared_record_owner_not_linked')
      }
      case 'first': {
        for (const candidate of rule.rules) {
          if (candidate.kind === 'parent' && !identity(row[candidate.column])) continue
          return await resolveRule(candidate, row, path)
        }
        return unresolved('parent_key_missing')
      }
    }
  }
  const resolveRow = async (table: string, row: AuditOwnershipRow, path: readonly string[] = []): Promise<AuditOwnership> => {
    const rule = Object.hasOwn(registry, table) ? registry[table] : undefined
    if (!rule && table.startsWith('extensions.')) return { type: 'global', reason: 'Extension has not declared agency ownership' }
    return rule ? await resolveRule(rule, row, path) : unresolved('unregistered_table')
  }
  return {
    resolveRow: source.resolveRow ?? resolveRow,
    resolveIdentity: source.resolveIdentity ?? (async (table: string, id: string): Promise<AuditOwnership> => await resolveLoaded(table, { id }, []))
  }
}
