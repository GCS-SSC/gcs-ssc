import { TransferPaymentEligibleRecipientSchema } from '~~/shared/types/schemas'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
// eslint-disable-next-line local/require-authorize -- delegated to authorizeTransferPaymentStreamResource
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const access = await authorizeTransferPaymentStreamResource(event, 'create', profileId, streamId)
  if (!access) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  const validated = await readValidatedBodyI18n(event, TransferPaymentEligibleRecipientSchema)

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, access.agencyId, streamId, 'create', async (trx, context) => {
      const stakeholder = await trx.selectFrom('Agency_Applicant_Recipient_Subtype').select('id')
        .where('id', '=', validated.egcs_tp_applicantrecipientsubtype)
        .where('egcs_ay_organizationagency', '=', context.agencyId)
        .where('_deleted', '=', false).forUpdate().executeTakeFirst()
      if (!stakeholder) return await badRequest(event, 'INVALID_APPLICANT_RECIPIENT_SUBTYPE', 'apiErrors.transfer_payment.invalid_applicant_recipient_subtype')
      try {
        return await trx.insertInto('Transfer_Payment_Stream_Eligible_Recipient').values({
          egcs_tp_transferpaymentstream: streamId,
          egcs_tp_applicantrecipientsubtype: validated.egcs_tp_applicantrecipientsubtype
        }).returningAll().executeTakeFirstOrThrow()
      } catch (error) {
        return await throwIfTransferPaymentUniqueConstraintError(event, error)
      }
    }
  )
})
