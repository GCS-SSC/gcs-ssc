import { sql } from 'kysely'
import { TransferPaymentOutcomeSchema } from '~~/shared/types/schemas'
import { authorizeTransferPaymentProfileResource } from '~~/server/utils/transfer-payment-route-authorization'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { normalizeTextKey } from '~~/server/utils/transfer-payment-uniqueness'
import { executeFreshAuthorizedTransferPaymentWrite } from '~~/server/utils/transfer-payment-write-transaction'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  if (!profileId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const access = await authorizeTransferPaymentProfileResource(event, 'create', profileId)
  if (!access) {
    return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
  }

  const validated = await readValidatedBodyI18n(event, TransferPaymentOutcomeSchema)
  const normalizedNameEn = normalizeTextKey(validated.egcs_tp_name_en)
  const normalizedNameFr = normalizeTextKey(validated.egcs_tp_name_fr)

  try {
    return await executeFreshAuthorizedTransferPaymentWrite(
      event,
      db,
      profileId,
      access.agencyId,
      'create',
      async trx => {
        const duplicateOutcome = await trx
          .selectFrom('Transfer_Payment_Outcome')
          .select('id')
          .where('egcs_tp_transferpaymentprofile', '=', profileId)
          .where('_deleted', '=', false)
          .where(sql<boolean>`lower(btrim(egcs_tp_name_en)) = ${normalizedNameEn}`)
          .where(sql<boolean>`lower(btrim(egcs_tp_name_fr)) = ${normalizedNameFr}`)
          .executeTakeFirst()

        if (duplicateOutcome) {
          return await badRequest(
            event,
            'TRANSFER_PAYMENT_DUPLICATE_PROGRAM_OUTCOME_NAME',
            'apiErrors.transfer_payment.duplicate_program_outcome_name'
          )
        }

        return await trx
          .insertInto('Transfer_Payment_Outcome')
          .values({
            egcs_tp_transferpaymentprofile: profileId,
            egcs_tp_name_en: validated.egcs_tp_name_en,
            egcs_tp_name_fr: validated.egcs_tp_name_fr,
            egcs_tp_description_en: validated.egcs_tp_description_en,
            egcs_tp_description_fr: validated.egcs_tp_description_fr
          })
          .returningAll()
          .executeTakeFirstOrThrow()
      }
    )
  } catch (error) {
    return await throwIfTransferPaymentUniqueConstraintError(event, error)
  }
})
