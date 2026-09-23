import { sql } from 'kysely'
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
    const scoped = trx.selectFrom('Agency_Chart_of_Account')
      .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Agency_Chart_of_Account.egcs_ay_fiscalyear')
      .where('Agency_Chart_of_Account.egcs_ay_organizationagency', '=', agencyId)
      .where('Agency_Chart_of_Account._deleted', '=', false)
    let filtered = scoped
    if (search) {
      const pattern = `%${escapeLikePattern(search)}%`
      filtered = filtered.where(eb => eb.or([
        eb('Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay', 'ilike', pattern),
        sql<boolean>`CAST(${eb.ref('Agency_Chart_of_Account.egcs_ay_accountingdimensions')} AS TEXT) ILIKE ${pattern}`
      ]))
    }
    return await fetchAgencyScopedList({
      items: filtered.selectAll('Agency_Chart_of_Account').select('Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display')
        .orderBy('Agency_Chart_of_Account.id').limit(limit).offset((page - 1) * limit).execute(),
      filteredCount: filtered.select(eb => eb.fn.count('Agency_Chart_of_Account.id').as('total')).executeTakeFirst(),
      scopedCount: scoped.select(eb => eb.fn.count('Agency_Chart_of_Account.id').as('total')).executeTakeFirst(),
      page, limit
    })
  })
})
