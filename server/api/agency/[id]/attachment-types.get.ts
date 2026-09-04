import { PaginationSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyReadTransaction } from '~~/server/utils/agency-auth'
import { fetchAgencyScopedList } from '~~/server/utils/agency-scoped-list'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id')
  if (!agencyId) return await badRequest(event, 'MISSING_AGENCY_ID', 'apiErrors.request.missing_agency_id')
  if (!isPositivePostgresBigintText(agencyId)) {
    return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  }

  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  const offset = (page - 1) * limit

  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    const scopedQuery = trx
      .selectFrom('Common_Attachment_Types')
      .where('egcs_cn_agency', '=', agencyId)
      .where('_deleted', '=', false)
    let baseQuery = scopedQuery

    if (search) {
      const escapedSearch = escapeLikePattern(search)
      baseQuery = baseQuery.where(eb => eb.or([
        eb('egcs_cn_name_en', 'ilike', `%${escapedSearch}%`),
        eb('egcs_cn_name_fr', 'ilike', `%${escapedSearch}%`),
        eb('egcs_cn_description_en', 'ilike', `%${escapedSearch}%`),
        eb('egcs_cn_description_fr', 'ilike', `%${escapedSearch}%`)
      ]))
    }

    return await fetchAgencyScopedList({
      items: baseQuery.selectAll().orderBy('id', 'asc').limit(limit).offset(offset).execute(),
      filteredCount: baseQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst(),
      scopedCount: scopedQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst(),
      page,
      limit
    })
  })
})
