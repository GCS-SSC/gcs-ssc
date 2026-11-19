import { defineEventHandler, getRouterParam } from 'h3'
import { AgencyProponentRelationshipTypeSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { assertActiveAgencyProfile, withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { throwIfAgencyUniqueConstraintError } from '~~/server/utils/agency-unique-constraint-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  if (!agencyId) {
    return await badRequest(event, 'MISSING_AGENCY_ID', 'apiErrors.request.missing_agency_id')
  }
  if (!isPositivePostgresBigintText(agencyId)) {
    return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  }
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  await assertActiveAgencyProfile(event, agencyId)
  const validated = await readValidatedBodyI18n(event, AgencyProponentRelationshipTypeSchema)
  try {
    return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
      return await trx
        .insertInto('Agency_Proponent_Relationship_Type')
        .values({
          egcs_ay_organizationagency: agencyId,
          ...validated
        })
        .returningAll()
        .executeTakeFirstOrThrow()
    })
  } catch (error: unknown) {
    return await throwIfAgencyUniqueConstraintError(event, error)
  }
})
