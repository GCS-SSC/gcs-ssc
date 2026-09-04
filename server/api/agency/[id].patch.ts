import { AgencyProfilePatchSchema } from '~~/shared/types/schemas'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import type { Updateable } from 'kysely'
import type { AgencyProfileTable } from '~~/shared/types/database'
import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { throwIfAgencyUniqueConstraintError } from '~~/server/utils/agency-unique-constraint-errors'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(id)) {
    return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  }
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId: id })
  const validated = await readValidatedBodyI18n(event, AgencyProfilePatchSchema)

  let result
  try {
    result = await withActiveAgencyMutationTransaction(event, id, async trx => {
      return await trx
        .updateTable('Agency_Profile')
        .set(validated as Updateable<AgencyProfileTable>)
        .where('id', '=', id)
        .where('_deleted', '=', false)
        .returningAll()
        .executeTakeFirst()
    })
  } catch (error: unknown) {
    await throwIfAgencyUniqueConstraintError(event, error)
    throw error
  }

  if (!result) {
    return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  }

  return result
})
