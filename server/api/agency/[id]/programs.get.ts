import { TransferPaymentListQuerySchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyReadTransaction } from '~~/server/utils/agency-auth'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_AGENCY_ID', 'apiErrors.request.missing_agency_id')
  if (!isPositivePostgresBigintText(id)) {
    return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  }
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId: id })

  const query = await getValidatedQueryI18n(event, TransferPaymentListQuerySchema)
  const { page, limit, search, status } = query
  const offset = (page - 1) * limit

  return await withActiveAgencyReadTransaction(event, id, async trx => {
    const scopedQuery = trx
      .selectFrom('Transfer_Payment_Profile')
      .where('egcs_tp_agency', '=', id)
      .where('_deleted', '=', false)
    let filteredQuery = scopedQuery

    if (status && status !== 'all') {
      filteredQuery = filteredQuery.where('egcs_tp_active', '=', status === 'active')
    }

    if (search) {
      const escapedSearch = escapeLikePattern(search)
      filteredQuery = filteredQuery.where(eb =>
        eb.or([
          eb('egcs_tp_name_en', 'ilike', `%${escapedSearch}%`),
          eb('egcs_tp_name_fr', 'ilike', `%${escapedSearch}%`),
          eb('egcs_tp_abbreviation_en', 'ilike', `%${escapedSearch}%`),
          eb('egcs_tp_abbreviation_fr', 'ilike', `%${escapedSearch}%`)
        ])
      )
    }

    const [items, countResult, statsResult] = await Promise.all([
      filteredQuery.selectAll().orderBy('id', 'asc').limit(limit).offset(offset).execute(),
      filteredQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst(),
      scopedQuery
        .select([
          eb => eb.fn.count('id').as('total'),
          eb => eb.fn.count(eb.case().when('egcs_tp_active', '=', true).then(1).else(null).end()).as('active')
        ])
        .executeTakeFirst()
    ])

    return {
      items,
      total: Number(countResult?.total || 0),
      stats: {
        total: Number(statsResult?.total || 0),
        active: Number(statsResult?.active || 0)
      },
      page,
      limit
    }
  })
})
