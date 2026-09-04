import { TransferPaymentOutcomeSchema } from '~~/shared/types/schemas'
import { authorizeTransferPaymentOutcomeResource } from '~~/server/utils/transfer-payment-route-authorization'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
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

  const access = await authorizeTransferPaymentOutcomeResource(event, 'update', profileId, outcomeId)
  if (!access) {
    return await notFound(event, 'TRANSFER_PAYMENT_OUTCOME_NOT_FOUND', 'apiErrors.transfer_payment.outcome_not_found')
  }

  const validated = await readValidatedBodyI18n(event, TransferPaymentOutcomeSchema.partial())
  if (Object.keys(validated).length === 0) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }

  try {
    return await executeFreshAuthorizedTransferPaymentWrite(
      event,
      db,
      profileId,
      access.agencyId,
      'update',
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

        return await trx
          .updateTable('Transfer_Payment_Outcome')
          .set({ ...validated })
          .where('id', '=', outcomeId)
          .where('egcs_tp_transferpaymentprofile', '=', profileId)
          .where('_deleted', '=', false)
          .returningAll()
          .executeTakeFirstOrThrow()
      }
    )
  } catch (error) {
    return await throwIfTransferPaymentUniqueConstraintError(event, error)
  }
})
