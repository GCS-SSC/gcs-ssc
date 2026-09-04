import { z } from 'zod'
import { AGREEMENT_TYPE_ENUM } from '~~/shared/constants/enums'
import { PaginationSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyReadTransaction } from '~~/server/utils/agency-auth'
import { fetchAgencyScopedList } from '~~/server/utils/agency-scoped-list'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const AgencyAgreementTypeListQuerySchema = PaginationSchema.extend({
  status: z.enum(['all', ...AGREEMENT_TYPE_ENUM]).optional()
})

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

  const query = await getValidatedQueryI18n(event, AgencyAgreementTypeListQuerySchema)
  const { page, limit, search, status } = query
  const offset = (page - 1) * limit

  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    const scopedQuery = trx
      .selectFrom('Agency_Agreement_Type')
      .where('egcs_ay_organizationagency', '=', agencyId)
      .where('_deleted', '=', false)

    let baseQuery = scopedQuery

    if (status && status !== 'all') {
      baseQuery = baseQuery.where('egcs_ay_agreementtype', '=', status)
    }

    if (search) {
      const escapedSearch = escapeLikePattern(search)
      baseQuery = baseQuery.where(eb =>
        eb.or([
          eb('egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
          eb('egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`)
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
