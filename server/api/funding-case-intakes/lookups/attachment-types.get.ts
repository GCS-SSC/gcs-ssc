import { sql } from 'kysely'
import { AttachmentTypeLookupQuerySchema } from '~~/shared/types/schemas'
import { RequiredStringId } from '~~/shared/types/schemas/common'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { authorizeWithFreshAuthContext, requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { resolveFundingOpportunityScope } from '~~/server/utils/funding-case'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { badRequest, notFound } from '~~/server/utils/api-errors'

const QuerySchema = AttachmentTypeLookupQuerySchema.extend({
  egcs_fi_fundingopportunity: RequiredStringId().refine(isPositivePostgresBigintText, {
    message: 'validation.invalid_selection'
  })
})

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const query = await getValidatedQueryI18n(event, QuerySchema)
  const db = event.context.$db
  const offset = (query.page - 1) * query.limit
  const requestedIds = query.ids === undefined ? [] : (Array.isArray(query.ids) ? query.ids : [query.ids])
  return await db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    const scope = await resolveFundingOpportunityScope(trx, query.egcs_fi_fundingopportunity)
    if (!scope) return await notFound(event, 'FUNDING_OPPORTUNITY_NOT_FOUND', 'apiErrors.admin_common.not_found')
    await authorizeWithFreshAuthContext(event, auth, 'funding_case', 'create', scope.scope)
    const opportunity = await trx.selectFrom('Funding_Opportunity_Profile')
      .select('egcs_fo_status')
      .where('id', '=', scope.opportunityId).where('_deleted', '=', false)
      .where('egcs_fo_datestart', '<=', sql<Date>`CURRENT_DATE`)
      .where('egcs_fo_dateend', '>=', sql<Date>`CURRENT_DATE`)
      .executeTakeFirst()
    if (!opportunity || opportunity.egcs_fo_status !== 'open') {
      return await badRequest(event, 'FUNDING_OPPORTUNITY_CLOSED', 'apiErrors.request.invalid_status')
    }
    let base = trx.selectFrom('Common_Attachment_Types')
      .where('egcs_cn_agency', '=', scope.agencyId).where('_deleted', '=', false)
    if (query.search) {
      const search = `%${escapeLikePattern(query.search)}%`
      base = base.where(eb => eb.or([
        eb('egcs_cn_name_en', 'ilike', search),
        eb('egcs_cn_name_fr', 'ilike', search)
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
})
