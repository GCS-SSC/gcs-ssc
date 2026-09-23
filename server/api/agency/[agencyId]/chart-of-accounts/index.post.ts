import { sql } from 'kysely'
import { AgencyChartOfAccountSchema } from '~~/shared/types/schemas/transfer-payment'
import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { throwIfAgencyUniqueConstraintError } from '~~/server/utils/agency-unique-constraint-errors'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  if (!agencyId) return await badRequest(event, 'MISSING_AGENCY_ID', 'apiErrors.request.missing_agency_id')
  if (!isPositivePostgresBigintText(agencyId)) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  const body = await readValidatedBodyI18n(event, AgencyChartOfAccountSchema)
  try {
    return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
      const year = await trx.selectFrom('Agency_Fiscal_Year').select('id')
        .where('id', '=', String(body.egcs_ay_fiscalyear)).where('egcs_ay_organizationagency', '=', agencyId)
        .where('_deleted', '=', false).forUpdate().executeTakeFirst()
      if (!year) return await notFound(event, 'FISCAL_YEAR_NOT_FOUND', 'apiErrors.agency.fiscal_year_not_found')
      return await trx.insertInto('Agency_Chart_of_Account').values({
        egcs_ay_organizationagency: agencyId,
        egcs_ay_fiscalyear: String(body.egcs_ay_fiscalyear),
        egcs_ay_accountingdimensions: sql`${JSON.stringify(body.egcs_ay_accountingdimensions)}::jsonb`,
        _deleted: false
      }).returningAll().executeTakeFirstOrThrow()
    })
  } catch (error: unknown) {
    await throwIfAgencyUniqueConstraintError(event, error)
    throw error
  }
})
