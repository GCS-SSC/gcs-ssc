import { sql } from 'kysely'
import { AgencyFiscalYearSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { assertActiveAgencyProfile, withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { throwIfAgencyUniqueConstraintError } from '~~/server/utils/agency-unique-constraint-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const asPostgresDate = (value: Date) => sql<Date>`${value.toISOString().slice(0, 10)}::date`

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
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  await assertActiveAgencyProfile(event, agencyId)
  const validated = await readValidatedBodyI18n(event, AgencyFiscalYearSchema)
  try {
    return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
      return await trx.insertInto('Agency_Fiscal_Year')
        .values({
          egcs_ay_organizationagency: agencyId,
          egcs_ay_fiscalyeardisplay: validated.egcs_ay_fiscalyeardisplay,
          egcs_ay_fiscalyear: validated.egcs_ay_fiscalyear,
          egcs_ay_startdate: asPostgresDate(validated.egcs_ay_startdate),
          egcs_ay_enddate: asPostgresDate(validated.egcs_ay_enddate)
        })
        .returningAll()
        .executeTakeFirstOrThrow()
    })
  } catch (error: unknown) {
    await throwIfAgencyUniqueConstraintError(event, error)
    throw error
  }
})
