import { TransferPaymentEligibleRecipientSchema } from '~~/shared/types/schemas'
import { authorizeTransferPaymentEligibleRecipientResource } from '~~/server/utils/transfer-payment-route-authorization'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
// eslint-disable-next-line local/require-authorize -- delegated to authorizeTransferPaymentEligibleRecipientResource
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const recipientId = getRouterParam(event, 'eligibleRecipientId')
  if (!profileId || !streamId || !recipientId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const access = await authorizeTransferPaymentEligibleRecipientResource(event, 'update', profileId, streamId, recipientId)
  if (!access) {
    return await notFound(
      event,
      'TRANSFER_PAYMENT_ELIGIBLE_RECIPIENT_NOT_FOUND',
      'apiErrors.transfer_payment.eligible_recipient_not_found'
    )
  }

  const validated = await readValidatedBodyI18n(event, TransferPaymentEligibleRecipientSchema.partial())
  if (Object.keys(validated).length === 0) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, access.agencyId, streamId, 'update', async (trx, context) => {
      const current = await trx.selectFrom('Transfer_Payment_Stream_Eligible_Recipient').select('id')
        .where('id', '=', recipientId).where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false).forUpdate().executeTakeFirst()
      if (!current) return await notFound(event, 'TRANSFER_PAYMENT_ELIGIBLE_RECIPIENT_NOT_FOUND', 'apiErrors.transfer_payment.eligible_recipient_not_found')
      if (validated.egcs_tp_applicantrecipientsubtype) {
        const applicantRecipientSubtype = await trx
          .selectFrom('Agency_Applicant_Recipient_Subtype')
          .where('id', '=', validated.egcs_tp_applicantrecipientsubtype)
          .where('egcs_ay_organizationagency', '=', context.agencyId)
          .where('_deleted', '=', false)
          .select('id')
          .forUpdate()
          .executeTakeFirst()

        if (!applicantRecipientSubtype) return await badRequest(event, 'INVALID_APPLICANT_RECIPIENT_SUBTYPE', 'apiErrors.transfer_payment.invalid_applicant_recipient_subtype')
      }
      try {
        return await trx
          .updateTable('Transfer_Payment_Stream_Eligible_Recipient')
          .set(validated)
          .where('id', '=', recipientId)
          .where('egcs_tp_transferpaymentstream', '=', streamId)
          .where('_deleted', '=', false)
          .returningAll()
          .executeTakeFirstOrThrow()
      } catch (error) {
        return await throwIfTransferPaymentUniqueConstraintError(event, error)
      }
    }
  )
})
