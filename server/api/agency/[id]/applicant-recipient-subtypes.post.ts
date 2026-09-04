import { AgencyApplicantRecipientSubtypeSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { assertActiveAgencyProfile, withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { throwIfAgencyUniqueConstraintError } from '~~/server/utils/agency-unique-constraint-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

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
  const validated = await readValidatedBodyI18n(event, AgencyApplicantRecipientSubtypeSchema)
  try {
    return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
      return await trx.insertInto('Agency_Applicant_Recipient_Subtype')
        .values({
          egcs_ay_organizationagency: agencyId,
          egcs_ay_applicantrecipienttype: validated.egcs_ay_applicantrecipienttype,
          egcs_ay_description_en: validated.egcs_ay_description_en,
          egcs_ay_description_fr: validated.egcs_ay_description_fr,
          egcs_ay_name_en: validated.egcs_ay_name_en,
          egcs_ay_name_fr: validated.egcs_ay_name_fr
        })
        .returningAll()
        .executeTakeFirstOrThrow()
    })
  } catch (error: unknown) {
    await throwIfAgencyUniqueConstraintError(event, error)
    throw error
  }
})
