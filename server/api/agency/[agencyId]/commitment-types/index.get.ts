import { PaginationSchema } from '~~/shared/types/schemas/common'
import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyReadTransaction } from '~~/server/utils/agency-auth'
import { fetchAgencyScopedList } from '~~/server/utils/agency-scoped-list'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { badRequest, notFound } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  if (!agencyId) return await badRequest(event, 'MISSING_AGENCY_ID', 'apiErrors.request.missing_agency_id')
  if (!isPositivePostgresBigintText(agencyId)) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    const scoped = trx.selectFrom('Agency_Commitment_Type')
      .where('egcs_ay_organizationagency', '=', agencyId).where('_deleted', '=', false)
    let filtered = scoped
    if (search) {
      const pattern = `%${escapeLikePattern(search)}%`
      filtered = filtered.where(eb => eb.or([
        eb('egcs_ay_name_en', 'ilike', pattern), eb('egcs_ay_name_fr', 'ilike', pattern)
      ]))
    }
    return await fetchAgencyScopedList({
      items: filtered.selectAll().orderBy('id').limit(limit).offset((page - 1) * limit).execute(),
      filteredCount: filtered.select(eb => eb.fn.count('id').as('total')).executeTakeFirst(),
      scopedCount: scoped.select(eb => eb.fn.count('id').as('total')).executeTakeFirst(),
      page, limit
    })
  })
})
