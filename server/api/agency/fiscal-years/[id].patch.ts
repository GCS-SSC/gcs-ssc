import { sql } from 'kysely'
import { parseI18n } from '~~/server/utils/api-validate'
import { AgencyFiscalYearSchema, AgencyFiscalYearPatchSchema } from '~~/shared/types/schemas'
import { authorizeActiveAgencySubentity, withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { throwIfAgencyUniqueConstraintError } from '~~/server/utils/agency-unique-constraint-errors'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const { agencyId } = await authorizeActiveAgencySubentity(
    event,
    'Agency_Fiscal_Year',
    id,
    'update',
    { code: 'FISCAL_YEAR_NOT_FOUND', key: 'apiErrors.agency.fiscal_year_not_found' }
  )
  const body = await readValidatedBodyI18n(event, AgencyFiscalYearPatchSchema)
  if (Object.keys(body).length === 0) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }

  let result
  try {
    result = await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
      const current = await trx.selectFrom('Agency_Fiscal_Year').selectAll()
        .where('id', '=', id).where('egcs_ay_organizationagency', '=', agencyId)
        .where('_deleted', '=', false).forUpdate().executeTakeFirst()
      if (!current) return await notFound(event, 'FISCAL_YEAR_NOT_FOUND', 'apiErrors.agency.fiscal_year_not_found')
      const validated = await parseI18n(event, AgencyFiscalYearSchema, { ...current, ...body })
      return await trx
        .updateTable('Agency_Fiscal_Year')
        .set({
          ...validated,
          egcs_ay_startdate: sql<Date>`${validated.egcs_ay_startdate.toISOString().slice(0, 10)}::date`,
          egcs_ay_enddate: sql<Date>`${validated.egcs_ay_enddate.toISOString().slice(0, 10)}::date`
        })
        .where('id', '=', id)
        .where('egcs_ay_organizationagency', '=', agencyId)
        .where('_deleted', '=', false)
        .returningAll()
        .executeTakeFirst()
    })
  } catch (error: unknown) {
    await throwIfAgencyUniqueConstraintError(event, error)
    throw error
  }

  if (!result) return await notFound(event, 'FISCAL_YEAR_NOT_FOUND', 'apiErrors.agency.fiscal_year_not_found')
  return result
})
