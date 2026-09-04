import { PaginationSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyReadTransaction } from '~~/server/utils/agency-auth'
import { fetchAgencyScopedList } from '~~/server/utils/agency-scoped-list'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { escapeLikePattern } from '~~/server/utils/sql-like'

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
      .selectFrom('Agency_Cost_Category_Line_Item')
      .innerJoin(
        'Agency_Cost_Category',
        'Agency_Cost_Category.id',
        'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory'
      )
      .where('Agency_Cost_Category.egcs_ay_organizationagency', '=', agencyId)
      .where('Agency_Cost_Category_Line_Item._deleted', '=', false)
      .where('Agency_Cost_Category._deleted', '=', false)
    let filteredQuery = scopedQuery

    if (search) {
      const escapedSearch = escapeLikePattern(search)
      filteredQuery = filteredQuery.where(eb =>
        eb.or([
          eb('Agency_Cost_Category_Line_Item.egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
          eb('Agency_Cost_Category_Line_Item.egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`)
        ])
      )
    }

    return fetchAgencyScopedList({
      items: filteredQuery
        .select([
          'Agency_Cost_Category_Line_Item.id as id',
          'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory as egcs_ay_organizationcostcategory',
          'Agency_Cost_Category_Line_Item.egcs_ay_name_en as egcs_ay_name_en',
          'Agency_Cost_Category_Line_Item.egcs_ay_name_fr as egcs_ay_name_fr'
        ])
        .orderBy('Agency_Cost_Category_Line_Item.id', 'asc')
        .limit(limit)
        .offset(offset)
        .execute(),
      filteredCount: filteredQuery
        .select(eb => eb.fn.count('Agency_Cost_Category_Line_Item.id').as('total'))
        .executeTakeFirst(),
      scopedCount: scopedQuery
        .select(eb => eb.fn.count('Agency_Cost_Category_Line_Item.id').as('total'))
        .executeTakeFirst(),
      page,
      limit
    })
  })
})
