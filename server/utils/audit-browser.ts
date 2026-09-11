/* eslint-disable jsdoc/require-jsdoc -- Shared read-only query contracts. */
import { sql } from 'kysely'
import type { H3Event } from 'h3'
import { getRouterParams } from 'h3'
import { AuditAccessParamsSchema, AuditDetailSchema, AuditEventParamsSchema, AuditListQuerySchema, AuditListResponseSchema, type AuditSummary } from '~~/shared/types/schemas/audit'
import { getValidatedQueryI18n, parseI18n } from './api-validate'
import { escapeLikePattern } from './sql-like'
import { notFound } from './api-errors'

export const listAuditEvents = async (event: H3Event, kind: 'events' | 'access') => {
  const filters = await getValidatedQueryI18n(event, AuditListQuerySchema)
  const source = kind === 'access'
    ? sql`SELECT id::text, 'access'::text AS kind, created_at, actor_user_id, request_id, table_name,
      NULL::text AS record_id, outcome AS operation, returned_identities FROM audit.access_event`
    : sql`SELECT id::text, 'change'::text AS kind, created_at, actor_user_id, request_id, table_name,
        record_id, operation FROM audit.change_event
      UNION ALL SELECT id::text, 'security'::text, created_at, actor_user_id::text, request_id,
        target_type, target_id, event_type FROM audit.security_audit_event`
  const conditions = [sql`true`]
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
  const items = await sql<AuditSummary>`SELECT id, kind, created_at, actor_user_id, request_id, table_name, record_id, operation FROM (${source}) events WHERE ${where}
    ORDER BY created_at DESC, kind, id DESC LIMIT ${filters.limit} OFFSET ${(filters.page - 1) * filters.limit}`.execute(db)
  const count = await sql<{ total: string }>`SELECT count(*)::text AS total FROM (${source}) events WHERE ${where}`.execute(db)
  return AuditListResponseSchema.parse({ items: items.rows.map(row => ({ ...row, created_at: new Date(row.created_at).toISOString() })), total: Number(count.rows[0]?.total ?? 0), page: filters.page, limit: filters.limit })
}

export const auditEventDetail = async (event: H3Event, access: boolean) => {
  const params = getRouterParams(event)
  const validated = access
    ? await parseI18n(event, AuditAccessParamsSchema, params)
    : await parseI18n(event, AuditEventParamsSchema, params)
  const kind = 'kind' in validated ? validated.kind : 'access'
  const table = kind === 'change' ? 'audit.change_event' : kind === 'security' ? 'audit.security_audit_event' : 'audit.access_event'
  const result = await sql<Record<string, unknown>>`SELECT * FROM ${sql.table(table)} WHERE id = ${validated.id}`.execute(event.context.$db)
  if (!result.rows[0]) return await notFound(event, 'NOT_FOUND', 'apiErrors.request.not_found')
  return AuditDetailSchema.parse(JSON.parse(JSON.stringify(result.rows[0])))
}
