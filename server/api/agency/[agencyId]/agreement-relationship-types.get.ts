import { defineEventHandler, getRouterParam } from 'h3'
import { PaginationSchema } from '~~/shared/types/schemas'
import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { withActiveAgencyReadTransaction } from '~~/server/utils/agency-auth'
import { fetchAgencyScopedList } from '~~/server/utils/agency-scoped-list'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const agencyId = getRouterParam(event, 'agencyId')
  if (!agencyId) {
    return await badRequest(event, 'MISSING_AGENCY_ID', 'apiErrors.request.missing_agency_id')
  }
  if (!isPositivePostgresBigintText(agencyId)) {
    return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  }
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })

  const query = await getValidatedQueryI18n(event, PaginationSchema)
  const { page, limit, search } = query
  const offset = (page - 1) * limit

  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    const scopedQuery = trx
      .selectFrom('Agency_Agreement_Relationship_Type')
      .where('egcs_ay_organizationagency', '=', agencyId)
      .where('_deleted', '=', false)

    let baseQuery = scopedQuery

    if (search) {
      const escapedSearch = escapeLikePattern(search)
      baseQuery = baseQuery.where(eb =>
        eb.or([
          eb('egcs_ay_typename_en', 'ilike', `%${escapedSearch}%`),
          eb('egcs_ay_typename_fr', 'ilike', `%${escapedSearch}%`)
        ])
      )
    }

    return fetchAgencyScopedList({
      items: baseQuery.selectAll().orderBy('id', 'asc').limit(limit).offset(offset).execute(),
      filteredCount: baseQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst(),
      scopedCount: scopedQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst(),
      page,
      limit
    })
  })
})
