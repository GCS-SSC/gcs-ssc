import { sql } from 'kysely'
import { AttachmentTypeLookupQuerySchema } from '~~/shared/types/schemas'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { requireAuthContext } from '~~/server/utils/authorize'
import { requireFundingOpportunityAccess } from '~~/server/utils/funding-case-access'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { notFound } from '~~/server/utils/api-errors'

/** Reads Agency attachment types through the Opportunity's Program-scoped access. */
export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const id = getRouterParam(event, 'id')
  if (!id) return await notFound(event, 'FUNDING_OPPORTUNITY_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const query = await getValidatedQueryI18n(event, AttachmentTypeLookupQuerySchema)
  const db = event.context.$db
  const scope = await requireFundingOpportunityAccess(event, id, 'read', db)
  const offset = (query.page - 1) * query.limit
  const requestedIds = query.ids === undefined ? [] : (Array.isArray(query.ids) ? query.ids : [query.ids])
  let base = db.selectFrom('Common_Attachment_Types')
    .where('egcs_cn_agency', '=', scope.agencyId).where('_deleted', '=', false)
  if (query.search) {
    const search = `%${escapeLikePattern(query.search)}%`
    base = base.where(eb => eb.or([
      eb('egcs_cn_name_en', 'ilike', search), eb('egcs_cn_name_fr', 'ilike', search)
    ]))
  }
  if (requestedIds.length) base = base.where('id', 'in', requestedIds)
  const [items, count] = await Promise.all([
    base.selectAll().orderBy('egcs_cn_name_en').orderBy('id')
      .limit(query.limit).offset(offset).execute(),
    base.clearSelect().select(sql<number>`count(*)::int`.as('count')).executeTakeFirstOrThrow()
  ])
  return { items, stats: { total: Number(count.count), page: query.page, limit: query.limit } }
})
