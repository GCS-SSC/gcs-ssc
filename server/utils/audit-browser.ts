/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Shared read-only query contracts. */
import { sql } from 'kysely'
import type { H3Event } from 'h3'
import { getRouterParams } from 'h3'
import { AuditAccessParamsSchema, AuditDetailSchema, AuditEventParamsSchema, AuditListQuerySchema, AuditListResponseSchema, type AuditSummary } from '~~/shared/types/schemas/audit'
import { getValidatedQueryI18n, parseI18n } from './api-validate'
import { escapeLikePattern } from './sql-like'
import { requireAuthContext, type AuthContext } from './authorize'
import type { UserAbilities } from '@gcs-ssc/authorization'
import { notFound } from './api-errors'

/**
 * Grant predicates are part of the evidence query, before search, counts and pagination.
 */
export const auditVisibilityPredicate = (abilities: UserAbilities) => {
  if (abilities.authorize('audit', 'read', { type: 'global' })) return sql`true`
  const agencies = abilities.getGrants().flatMap(grant =>
    grant.subject === 'audit' && grant.action === 'read' && grant.scope.type === 'agency' ? [grant.scope.agencyId] : [])
  return agencies.length
    ? sql`scope_type = 'agency' AND (agency_ids && ARRAY[${sql.join(agencies)}]::text[]
    OR (coalesce(cardinality(agency_ids), 0) = 0 AND agency_id IN (${sql.join(agencies)})))`
    : sql`false`
}

/** Uses the same request grant snapshot for entry and row predicates. */
export const resolveAuditReadAccess = async ({ context }: { context: AuthContext }) => ({
  scopes: context.userAbilities.getGrants().filter(grant => grant.subject === 'audit' && grant.action === 'read').map(grant => grant.scope)
})

const detailFields = {
  change: ['id', 'created_at', 'actor_user_id', 'actor_kind', 'request_id', 'query_id', 'table_name', 'record_id', 'record_keys', 'operation', 'delta'],
  security: ['id', 'created_at', 'actor_user_id', 'request_id', 'event_type', 'target_type', 'target_id', 'metadata'],
  access: ['id', 'created_at', 'actor_user_id', 'actor_kind', 'request_id', 'sql', 'duration_ms', 'outcome', 'transaction_outcome', 'row_count', 'returned_identities', 'limitations', 'table_name', 'error_code']
} as const

export const projectAuditDetail = (row: Record<string, unknown>, kind: keyof typeof detailFields, abilities: UserAbilities) => {
  const agencyIds = Array.isArray(row.agency_ids) && row.agency_ids.length
    ? row.agency_ids.map(String)
    : row.agency_id ? [String(row.agency_id)] : []
  const visible = row.scope_type === 'agency'
    ? agencyIds.some(agencyId => abilities.canViewAuditInputs({ type: 'agency', agencyId }))
    : abilities.canViewAuditInputs({ type: 'global' })
  const result: Record<string, unknown> = Object.fromEntries(
    [...detailFields[kind], 'scope_type', 'agency_id', 'agency_ids', 'transaction_id', 'attribution_error'].map(key => [key, row[key] ?? null]))
  result.agency_ids = agencyIds
  const captured = row.inputs as { state?: string } | null
  result.input_visibility = !visible ? 'restricted' : captured?.state === 'captured' ? 'captured' : 'unavailable'
  if (visible && row.inputs) result.inputs = row.inputs
  return result
}

export const listAuditEvents = async (event: H3Event, kind: 'events' | 'access') => {
  const { userAbilities } = await requireAuthContext(event)
  const filters = await getValidatedQueryI18n(event, AuditListQuerySchema)
  const source = kind === 'access'
    ? sql`SELECT id::text, 'access'::text AS kind, created_at, actor_user_id, request_id, table_name, scope_type, agency_id, agency_ids,
      NULL::text AS record_id, outcome AS operation, returned_identities FROM audit.access_event`
    : sql`SELECT id::text, 'change'::text AS kind, created_at, actor_user_id, request_id, table_name, scope_type, agency_id, agency_ids,
        record_id, operation FROM audit.change_event
      UNION ALL SELECT id::text, 'security'::text, created_at, actor_user_id::text, request_id,
        target_type, scope_type, agency_id, agency_ids, target_id, event_type FROM audit.security_audit_event`
  const conditions = [sql`(${auditVisibilityPredicate(userAbilities)})`]
  if (filters.from) conditions.push(sql`created_at >= ${filters.from}::timestamptz`)
  if (filters.to) conditions.push(sql`created_at <= ${filters.to}::timestamptz`)
  for (const [key, column] of [['actor', 'actor_user_id'], ['table', 'table_name'], ['recordId', 'record_id'], ['operation', 'operation'], ['requestId', 'request_id']] as const) {
    if (kind === 'access' && key === 'recordId') continue
    if (filters[key]) conditions.push(sql`${sql.ref(column)} = ${filters[key]}`)
  }
  if (kind === 'access' && filters.recordId) {
    conditions.push(sql`EXISTS (SELECT 1 FROM jsonb_array_elements(returned_identities) AS identity,
      jsonb_each_text(identity->'keys') AS key WHERE key.value = ${filters.recordId})`)
  }
  if (filters.search) {
    const pattern = `%${escapeLikePattern(filters.search)}%`
    conditions.push(sql`(table_name ILIKE ${pattern} OR request_id ILIKE ${pattern} OR operation ILIKE ${pattern} OR actor_user_id ILIKE ${pattern})`)
  }
  const where = sql.join(conditions, sql` AND `)
  const db = event.context.$db
  const items = await sql<AuditSummary>`SELECT id, kind, created_at, actor_user_id, request_id, table_name, record_id, operation, scope_type, agency_id, agency_ids FROM (${source}) events WHERE ${where}
    ORDER BY created_at DESC, kind, id DESC LIMIT ${filters.limit} OFFSET ${(filters.page - 1) * filters.limit}`.execute(db)
  const count = await sql<{ total: string }>`SELECT count(*)::text AS total FROM (${source}) events WHERE ${where}`.execute(db)
  return AuditListResponseSchema.parse({ items: items.rows.map(row => ({ ...row, created_at: new Date(row.created_at).toISOString() })), total: Number(count.rows[0]?.total ?? 0), page: filters.page, limit: filters.limit })
}

export const auditEventDetail = async (event: H3Event, access: boolean) => {
  const { userAbilities } = await requireAuthContext(event)
  const params = getRouterParams(event)
  const validated = access
    ? await parseI18n(event, AuditAccessParamsSchema, params)
    : await parseI18n(event, AuditEventParamsSchema, params)
  const kind = 'kind' in validated && (validated.kind === 'change' || validated.kind === 'security') ? validated.kind : 'access'
  const table = kind === 'change' ? 'audit.change_event' : kind === 'security' ? 'audit.security_audit_event' : 'audit.access_event'
  const result = await sql<Record<string, unknown>>`SELECT * FROM ${sql.table(table)} WHERE id = ${validated.id} AND (${auditVisibilityPredicate(userAbilities)})`.execute(event.context.$db)
  if (!result.rows[0]) return await notFound(event, 'NOT_FOUND', 'apiErrors.request.not_found')
  return AuditDetailSchema.parse(JSON.parse(JSON.stringify(projectAuditDetail(result.rows[0], kind, userAbilities))))
}
