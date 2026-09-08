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
      if (validated.egcs_ay_gwcoa_number !== undefined) {
        // The parent helper already holds this Agency's row lock. An unchanged
        // historical reference remains valid even after the GWCOA is retired.
        const current = await trx.selectFrom('Agency_Profile')
          .select('egcs_ay_gwcoa_number').where('id', '=', id).executeTakeFirstOrThrow()
        if (String(current.egcs_ay_gwcoa_number) !== validated.egcs_ay_gwcoa_number) {
          const selected = await trx.selectFrom('Common_GWCOA').select('id')
            .where('egcs_cn_number', '=', Number(validated.egcs_ay_gwcoa_number))
            .where('_deleted', '=', false).forShare().executeTakeFirst()
          if (!selected) {
            return await badRequest(event, 'AGENCY_INVALID_GWCOA_NUMBER', 'apiErrors.agency.invalid_gwcoa_number')
          }
        }
      }
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
