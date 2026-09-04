import { sql } from 'kysely'
import { AdminCommonListQuerySchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { escapeLikePattern } from '~~/server/utils/sql-like'

const GwcoaListQuerySchema = AdminCommonListQuerySchema.pick({
  page: true,
  limit: true,
  search: true,
  status: true,
  deleted: true
})

export default defineEventHandler(async event => await executeFreshReadSnapshot(event, async db => {
  await authorize(event, 'system', 'read', { type: 'global' })
  const { page, limit, search, status, deleted } = await getValidatedQueryI18n(event, GwcoaListQuerySchema)
  const offset = (page - 1) * limit
  const deletedFilter = deleted ?? (status === 'active' ? false : status === 'deleted' ? true : undefined)
  let query = db.selectFrom('Common_GWCOA')

  if (deletedFilter !== undefined) query = query.where('_deleted', '=', deletedFilter)
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`
    query = query.where(eb => eb.or([
      eb(sql<string>`CAST(${eb.ref('id')} AS TEXT)`, 'ilike', pattern),
      eb(sql<string>`CAST(${eb.ref('egcs_cn_number')} AS TEXT)`, 'ilike', pattern),
      eb('egcs_cn_name_en', 'ilike', pattern),
      eb('egcs_cn_name_fr', 'ilike', pattern)
    ]))
  }

  const [items, count, stats] = await Promise.all([
    query.selectAll().orderBy('id', 'asc').limit(limit).offset(offset).execute(),
    query.select(eb => eb.fn.count('id').as('total')).executeTakeFirst(),
    db.selectFrom('Common_GWCOA').select(eb => [
      eb.fn.count('id').as('total'),
      eb.fn.count('id').filterWhere('_deleted', '=', false).as('active')
    ]).executeTakeFirst()
  ])

  return {
    items,
    total: Number(count?.total ?? 0),
    stats: { total: Number(stats?.total ?? 0), active: Number(stats?.active ?? 0) },
    page,
    limit
  }
}))
