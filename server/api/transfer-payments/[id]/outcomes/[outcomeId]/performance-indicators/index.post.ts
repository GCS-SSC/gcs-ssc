import { sql } from 'kysely'
import { TransferPaymentPerformanceIndicatorSchema } from '~~/shared/types/schemas'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { normalizeTextKey } from '~~/server/utils/transfer-payment-uniqueness'
import { authorizeTransferPaymentOutcomeResource } from '~~/server/utils/transfer-payment-route-authorization'
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
  const outcomeId = getRouterParam(event, 'outcomeId')
  if (!profileId || !outcomeId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const outcomeAccess = await authorizeTransferPaymentOutcomeResource(event, 'create', profileId, outcomeId)
  if (!outcomeAccess) {
    return await notFound(event, 'TRANSFER_PAYMENT_OUTCOME_NOT_FOUND', 'apiErrors.transfer_payment.outcome_not_found')
  }
  const validated = await readValidatedBodyI18n(event, TransferPaymentPerformanceIndicatorSchema)
  const normalizedNameEn = normalizeTextKey(validated.egcs_tp_name_en)
  const normalizedNameFr = normalizeTextKey(validated.egcs_tp_name_fr)

  try {
    return await executeFreshAuthorizedTransferPaymentWrite(
      event,
      db,
      profileId,
      outcomeAccess.agencyId,
      'create',
      async trx => {
        const lockedOutcome = await trx
          .selectFrom('Transfer_Payment_Outcome')
          .select('id')
          .where('id', '=', outcomeId)
          .where('egcs_tp_transferpaymentprofile', '=', profileId)
          .where('_deleted', '=', false)
          .forUpdate('Transfer_Payment_Outcome')
          .executeTakeFirst()
        if (!lockedOutcome) {
          return await notFound(event, 'TRANSFER_PAYMENT_OUTCOME_NOT_FOUND', 'apiErrors.transfer_payment.outcome_not_found')
        }

        const duplicateIndicator = await trx
          .selectFrom('Transfer_Payment_Outcome_Performance_Indicator')
          .select('id')
          .where('egcs_tp_transferpaymentoutcome', '=', outcomeId)
          .where('_deleted', '=', false)
          .where(sql<boolean>`
            (
              lower(btrim(egcs_tp_name_en)) = ${normalizedNameEn}
              OR lower(btrim(egcs_tp_name_fr)) = ${normalizedNameFr}
            )
          `)
          .executeTakeFirst()

        if (duplicateIndicator) {
          return await badRequest(
            event,
            'TRANSFER_PAYMENT_DUPLICATE_OUTCOME_PERFORMANCE_INDICATOR_NAME',
            'apiErrors.transfer_payment.duplicate_outcome_performance_indicator_name'
          )
        }

        return await trx
          .insertInto('Transfer_Payment_Outcome_Performance_Indicator')
          .values({
            egcs_tp_transferpaymentoutcome: outcomeId,
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
