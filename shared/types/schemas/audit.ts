import { z } from 'zod'
import { PositivePostgresBigintIdSchema } from './common'

const filter = z.string({ error: 'validation.invalid_selection' }).max(200, { error: 'validation.invalid_selection' }).optional()
export const AuditListQuerySchema = z.object({
  page: z.coerce.number({ error: 'validation.invalid_number' }).int({ error: 'validation.invalid_number' }).min(1, { error: 'validation.invalid_number' }).default(1),
  limit: z.coerce.number({ error: 'validation.invalid_number' }).int({ error: 'validation.invalid_number' }).min(1, { error: 'validation.invalid_number' }).max(100, { error: 'validation.invalid_number' }).default(20),
  from: z.iso.datetime({ error: 'validation.invalid_selection' }).optional(),
  to: z.iso.datetime({ error: 'validation.invalid_selection' }).optional(),
  search: filter, actor: filter, table: filter, recordId: filter, operation: filter, requestId: filter
}).refine(value => !value.from || !value.to || value.from <= value.to, { error: 'validation.invalid_selection' })
export const AuditEventParamsSchema = z.object({ kind: z.enum(['change', 'security'], { error: 'validation.invalid_selection' }), id: PositivePostgresBigintIdSchema })
export const AuditAccessParamsSchema = z.object({ id: z.uuid({ error: 'validation.invalid_selection' }) })
export const AuditSummarySchema = z.object({
  id: z.string(), kind: z.enum(['change', 'security', 'access']), created_at: z.string(),
  actor_user_id: z.string().nullable(), request_id: z.string().nullable(), table_name: z.string().nullable(),
  record_id: z.string().nullable(), operation: z.string()
})
export const AuditListResponseSchema = z.object({
  items: z.array(AuditSummarySchema), total: z.number(), page: z.number(), limit: z.number()
})
export const AuditDetailSchema = z.record(z.string(), z.json())
export type AuditSummary = z.infer<typeof AuditSummarySchema>
export type AuditListResponse = z.infer<typeof AuditListResponseSchema>
export type AuditDetail = z.infer<typeof AuditDetailSchema>
