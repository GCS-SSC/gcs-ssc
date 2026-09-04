import { PaginationSchema } from '~~/shared/types/schemas'
import {
  authorizeActiveAgencyCostCategory,
  withActiveAgencyCostCategoryReadTransaction
} from '~~/server/utils/agency-auth'
import { escapeLikePattern } from '~~/server/utils/sql-like'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const categoryId = getRouterParam(event, 'id')
  if (!categoryId) {
    return await badRequest(event, 'MISSING_CATEGORY_ID', 'apiErrors.request.missing_category_id')
  }
  const { agencyId } = await authorizeActiveAgencyCostCategory(
    event,
    categoryId,
    'read',
    { code: 'CATEGORY_NOT_FOUND', key: 'apiErrors.agency.category_not_found' }
  )

  const query = await getValidatedQueryI18n(event, PaginationSchema)
  const { page, limit, search } = query
  const offset = (page - 1) * limit

  return await withActiveAgencyCostCategoryReadTransaction(event, agencyId, categoryId, async trx => {
    const scopedQuery = trx
      .selectFrom('Agency_Cost_Category_Line_Item')
      .where('egcs_ay_organizationcostcategory', '=', categoryId)
      .where('_deleted', '=', false)
    let baseQuery = scopedQuery

    if (search) {
      const escapedSearch = escapeLikePattern(search)
      baseQuery = baseQuery.where(eb =>
        eb.or([
          eb('egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
          eb('egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`)
        ])
      )
    }

    const [items, countResult, statsResult] = await Promise.all([
      baseQuery.selectAll().orderBy('id', 'asc').limit(limit).offset(offset).execute(),
      baseQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst(),
      scopedQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst()
    ])

    const total = Number(countResult?.total || 0)
    const statsTotal = Number(statsResult?.total || 0)

    return {
      items,
      total,
      stats: { total: statsTotal, active: statsTotal },
      page,
      limit
    }
  })
})
