import { TransferPaymentProfileSchema } from '~~/shared/types/schemas'
import {
  authorize,
  authorizeWithFreshAuthContext,
  requireFreshAuthContext
} from '~~/server/utils/authorize'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const validated = await readValidatedBodyI18n(event, TransferPaymentProfileSchema)

  await authorize(event, 'transfer_payment', 'create', {
    type: 'agency',
    agencyId: String(validated.egcs_tp_agency)
  })

  return await db.transaction().execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx)
    const agency = await trx
      .selectFrom('Agency_Profile')
      .where('id', '=', validated.egcs_tp_agency)
      .where('_deleted', '=', false)
      .select('id')
      .forUpdate('Agency_Profile')
      .executeTakeFirst()

    if (!agency) {
      return await badRequest(event, 'INVALID_AGENCY', 'apiErrors.request.invalid_agency')
    }

    await authorizeWithFreshAuthContext(event, authContext, 'transfer_payment', 'create', {
      type: 'agency',
      agencyId: String(agency.id)
    })

    return await trx
      .insertInto('Transfer_Payment_Profile')
      .values({
        egcs_tp_agency: validated.egcs_tp_agency,
        egcs_tp_datestart: validated.egcs_tp_datestart,
        egcs_tp_dateend: validated.egcs_tp_dateend,
        egcs_tp_name_en: validated.egcs_tp_name_en,
        egcs_tp_name_fr: validated.egcs_tp_name_fr,
        egcs_tp_abbreviation_en: validated.egcs_tp_abbreviation_en,
        egcs_tp_abbreviation_fr: validated.egcs_tp_abbreviation_fr,
        egcs_tp_description_en: validated.egcs_tp_description_en,
        egcs_tp_description_fr: validated.egcs_tp_description_fr,
        egcs_tp_purpose_en: validated.egcs_tp_purpose_en,
        egcs_tp_purpose_fr: validated.egcs_tp_purpose_fr,
        egcs_tp_tclink: validated.egcs_tp_tclink,
        egcs_tp_active: validated.egcs_tp_active
      })
      .returningAll()
      .executeTakeFirstOrThrow()
  })
})
