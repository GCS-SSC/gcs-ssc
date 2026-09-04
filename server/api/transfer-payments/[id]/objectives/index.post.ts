import { sql } from 'kysely'
import { TransferPaymentObjectiveSchema } from '~~/shared/types/schemas/transfer-payment'
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

  const body = await readValidatedBodyI18n(event, TransferPaymentObjectiveSchema)
  const normalizedObjectiveEn = normalizeTextKey(body.egcs_tp_objective_en)
  const normalizedObjectiveFr = normalizeTextKey(body.egcs_tp_objective_fr)

  try {
    return await executeFreshAuthorizedTransferPaymentWrite(
      event,
      db,
      profileId,
      access.agencyId,
      'create',
      async trx => {
        const duplicateObjective = await trx
          .selectFrom('Transfer_Payment_Objective')
          .select('id')
          .where('egcs_tp_transferpaymentprofile', '=', profileId)
          .where('_deleted', '=', false)
          .where(sql<boolean>`lower(btrim(egcs_tp_objective_en)) = ${normalizedObjectiveEn}`)
          .where(sql<boolean>`lower(btrim(egcs_tp_objective_fr)) = ${normalizedObjectiveFr}`)
          .executeTakeFirst()

        if (duplicateObjective) {
          return await badRequest(
            event,
            'TRANSFER_PAYMENT_DUPLICATE_PROGRAM_OBJECTIVE',
            'apiErrors.transfer_payment.duplicate_program_objective'
          )
        }

        return await trx
          .insertInto('Transfer_Payment_Objective')
          .values({
            ...body,
            egcs_tp_transferpaymentprofile: profileId,
            _deleted: false
          })
          .returningAll()
          .executeTakeFirstOrThrow()
      }
    )
  } catch (error) {
    return await throwIfTransferPaymentUniqueConstraintError(event, error)
  }
})
