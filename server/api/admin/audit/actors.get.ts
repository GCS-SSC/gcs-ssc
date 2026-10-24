import { defineEventHandler } from 'h3'
import { z } from 'zod'
import { sql } from 'kysely'
import { AdminCommonListQuerySchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { resolveAuditReadAccess } from '~~/server/utils/audit-browser'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { escapeLikePattern } from '~~/server/utils/sql-like'

const ActorLookupQuerySchema = AdminCommonListQuerySchema.extend({
  selectedIds: z.union([PositivePostgresBigintIdSchema, z.array(PositivePostgresBigintIdSchema).min(1, { error: 'validation.required' }).max(100, { error: 'validation.max_items' })])
    .transform(value => Array.isArray(value) ? value : [value]).optional()
})

export default defineEventHandler(async event => await executeFreshReadSnapshot(event, async db => {
  await authorize(event, 'audit', 'read', resolveAuditReadAccess)
  const { page, limit, search, selectedIds } = await getValidatedQueryI18n(event, ActorLookupQuerySchema)
  // Audit readers may resolve all actors, including deleted users retained in historical evidence.
  let query = db.selectFrom('user')
  if (selectedIds) query = query.where('user.id', 'in', selectedIds)
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`
    query = query.where(eb => eb.or([
      eb('user.name', 'ilike', pattern),
      eb(sql<string>`"user".id::text`, 'ilike', pattern)
    ]))
  }
  const items = await query.select(['user.id', 'user.name']).orderBy('user.name').orderBy('user.id')
    .limit(limit).offset((page - 1) * limit).execute()
  const count = await query.select(eb => eb.fn.countAll<string>().as('total')).executeTakeFirstOrThrow()
  return { items, total: Number(count.total), page, limit }
}, { authorization: 'snapshot' }))
