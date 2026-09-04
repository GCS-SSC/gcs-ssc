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
  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    const scopedQuery = trx.selectFrom('Agency_Holdback_Basis')
      .where('egcs_ay_organizationagency', '=', agencyId).where('_deleted', '=', false)
    let baseQuery = scopedQuery
    if (search) {
      const term = `%${escapeLikePattern(search)}%`
      baseQuery = baseQuery.where(eb => eb.or([
        eb('egcs_ay_languageindependentcode', 'ilike', term),
        eb('egcs_ay_name_en', 'ilike', term), eb('egcs_ay_name_fr', 'ilike', term)
      ]))
    }
    return await fetchAgencyScopedList({
      items: baseQuery.selectAll().orderBy('id', 'asc').limit(limit).offset((page - 1) * limit).execute(),
      filteredCount: baseQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst(),
      scopedCount: scopedQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst(), page, limit
    })
  })
})
