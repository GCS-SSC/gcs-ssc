import { z } from 'zod'
import { PositivePostgresBigintIdSchema } from './common'

const filter = z.string({ error: 'validation.invalid_selection' }).max(200, { error: 'validation.invalid_selection' })
  .refine(value => !value.includes('\u0000'), { error: 'validation.invalid_text_character' }).optional()
const AuditListQueryBaseSchema = z.object({
  page: z.coerce.number({ error: 'validation.invalid_number' }).int({ error: 'validation.invalid_number' }).min(1, { error: 'validation.invalid_number' }).default(1),
  limit: z.coerce.number({ error: 'validation.invalid_number' }).int({ error: 'validation.invalid_number' }).min(1, { error: 'validation.invalid_number' }).max(100, { error: 'validation.invalid_number' }).default(20),
  from: z.iso.datetime({ error: 'validation.invalid_selection' }).optional(),
  to: z.iso.datetime({ error: 'validation.invalid_selection' }).optional(),
  search: filter, actor: filter, table: filter, recordId: filter, operation: filter, requestId: filter
})
export const AuditListQuerySchema = AuditListQueryBaseSchema.refine(value => !value.from || !value.to || value.from <= value.to, { error: 'validation.invalid_selection' })
export const AuditAccessListQuerySchema = AuditListQueryBaseSchema.omit({ page: true }).extend({
  before: z.iso.datetime({ error: 'validation.invalid_selection' }).optional(),
  beforeId: z.uuid({ error: 'validation.invalid_selection' }).optional()
}).refine(value => Boolean(value.before) === Boolean(value.beforeId), { error: 'validation.invalid_selection' })
  .refine(value => !value.from || !value.to || value.from <= value.to, { error: 'validation.invalid_selection' })
export const AuditEventParamsSchema = z.object({ kind: z.enum(['change', 'security'], { error: 'validation.invalid_selection' }), id: PositivePostgresBigintIdSchema })
export const AuditAccessParamsSchema = z.object({ id: z.uuid({ error: 'validation.invalid_selection' }) })
export const AuditSummarySchema = z.object({
  id: z.string(), kind: z.enum(['change', 'security', 'access']), created_at: z.string(),
  actor_user_id: z.string().nullable(), request_id: z.string().nullable(), table_name: z.string().nullable(),
  record_id: z.string().nullable(), operation: z.string(),
  scope_type: z.enum(['historical', 'global', 'agency', 'unresolved']), agency_id: z.string().nullable(), agency_ids: z.array(z.string())
})
export const AuditListResponseSchema = z.object({
  items: z.array(AuditSummarySchema), total: z.number(), page: z.number(), limit: z.number()
})
export const AuditDetailSchema = z.record(z.string(), z.json())
export type AuditSummary = z.infer<typeof AuditSummarySchema>
export type AuditListResponse = z.infer<typeof AuditListResponseSchema>
export type AuditDetail = z.infer<typeof AuditDetailSchema>

export const AuditAccessListResponseSchema = z.object({
  items: z.array(AuditSummarySchema), limit: z.number(), from: z.string(), to: z.string(),
  nextCursor: z.object({ before: z.string(), beforeId: z.uuid() }).nullable()
})
export type AuditAccessListResponse = z.infer<typeof AuditAccessListResponseSchema>
