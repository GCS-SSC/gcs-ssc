import { sql } from 'kysely'

import { PaginationSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyReadTransaction } from '~~/server/utils/agency-auth'
import { fetchAgencyScopedList } from '~~/server/utils/agency-scoped-list'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id')
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
      .selectFrom('Agency_Fiscal_Year')
      .where('egcs_ay_organizationagency', '=', agencyId)
      .where('_deleted', '=', false)

    let baseQuery = scopedQuery

    if (search) {
      const escapedSearch = escapeLikePattern(search)
      baseQuery = baseQuery.where(eb =>
        eb.or([
          eb('egcs_ay_fiscalyeardisplay', 'ilike', `%${escapedSearch}%`),
          eb(sql<string>`CAST(egcs_ay_fiscalyear AS TEXT)`, 'ilike', `%${escapedSearch}%`)
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
