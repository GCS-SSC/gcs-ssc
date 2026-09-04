import { AgencyProfileSchema } from '~~/shared/types/schemas'
import {
  authorize,
  authorizeWithFreshAuthContext,
  requireFreshAuthContext
} from '~~/server/utils/authorize'
import { throwIfAgencyUniqueConstraintError } from '~~/server/utils/agency-unique-constraint-errors'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  await authorize(event, 'agency', 'create', { type: 'global' })
  const db = event.context.$db
  const validated = await readValidatedBodyI18n(event, AgencyProfileSchema)

  try {
    const result = await db.transaction().execute(async trx => {
      const authContext = await requireFreshAuthContext(event, trx)
      await authorizeWithFreshAuthContext(event, authContext, 'agency', 'create', { type: 'global' })
      const gwcoa = await trx.selectFrom('Common_GWCOA').select('id')
        .where('egcs_cn_number', '=', Number(validated.egcs_ay_gwcoa_number)).forShare().executeTakeFirst()
      if (!gwcoa) {
        return await badRequest(event, 'INVALID_GWCOA', 'validation.invalid_selection')
      }

      const agency = await trx
        .insertInto('Agency_Profile')
        .values({
          egcs_ay_gwcoa_number: Number(validated.egcs_ay_gwcoa_number),
          egcs_ay_agencyfinancialsystemid: validated.egcs_ay_agencyfinancialsystemid,
          egcs_ay_name_en: validated.egcs_ay_name_en,
          egcs_ay_name_fr: validated.egcs_ay_name_fr,
          egcs_ay_abbreviation_en: validated.egcs_ay_abbreviation_en,
          egcs_ay_abbreviation_fr: validated.egcs_ay_abbreviation_fr,
          egcs_ay_active: validated.egcs_ay_active
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      return agency
    })

    return result
  } catch (error: unknown) {
    await throwIfAgencyUniqueConstraintError(event, error)
    throw error
  }
})
