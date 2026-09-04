import { sql } from 'kysely'
import { AttachmentTypeLookupQuerySchema } from '~~/shared/types/schemas'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { authorizeFreshAttachmentTarget } from '~~/server/utils/attachment-target'
import { getAttachmentRouteTarget } from '~~/server/utils/attachment-route'
import { escapeLikePattern } from '~~/server/utils/sql-like'

// eslint-disable-next-line local/require-authorize -- authorizeFreshAttachmentTarget performs fresh scoped authorization inside the read transaction.
export default defineEventHandler(async event => {
  const target = await getAttachmentRouteTarget(event)
  const query = await getValidatedQueryI18n(event, AttachmentTypeLookupQuerySchema)
  const db = event.context.$db
  const offset = (query.page - 1) * query.limit
  const requestedIds = query.ids === undefined ? [] : (Array.isArray(query.ids) ? query.ids : [query.ids])

  return await db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const { resolved } = await authorizeFreshAttachmentTarget(event, target, 'read', trx)
    let base = trx.selectFrom('Common_Attachment_Types')
      .where('egcs_cn_agency', '=', resolved.agencyId)
      .where('_deleted', '=', false)
    if (query.search) {
      const search = `%${escapeLikePattern(query.search)}%`
      base = base.where(eb => eb.or([
        eb('egcs_cn_name_en', 'ilike', search),
        eb('egcs_cn_name_fr', 'ilike', search)
      ]))
    }
    if (requestedIds.length > 0) base = base.where('id', 'in', requestedIds)

    const [items, count] = await Promise.all([
      base.selectAll().orderBy('egcs_cn_name_en').orderBy('id').limit(query.limit).offset(offset).execute(),
      base.clearSelect().select(sql<number>`count(*)::int`.as('count')).executeTakeFirstOrThrow()
    ])
    return { items, stats: { total: Number(count.count), page: query.page, limit: query.limit } }
  })
})
