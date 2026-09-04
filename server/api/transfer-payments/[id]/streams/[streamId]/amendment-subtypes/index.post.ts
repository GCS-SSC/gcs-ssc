import { TransferPaymentAmendmentSubtypesSchema } from '~~/shared/types/schemas/transfer-payment'
import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'create', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'create', createTransferPaymentScopedAuthorizeHandler('create', streamContext.scope, db))

  const body = await readValidatedBodyI18n(event, TransferPaymentAmendmentSubtypesSchema)

  try {
    return await executeFreshAuthorizedTransferPaymentStreamWrite(
      event, db, profileId, streamContext.agencyId, streamId, 'create', async trx => {
        const amendmentTypes = await trx.selectFrom('Transfer_Payment_Amendment_Type')
          .where('id', 'in', body.amendment_type_ids)
          .where('egcs_tp_transferpaymentstream', '=', streamId)
          .where('_deleted', '=', false).select('id').execute()
        if (amendmentTypes.length !== body.amendment_type_ids.length) {
          return await badRequest(event, 'INVALID_AMENDMENT_TYPE', 'apiErrors.transfer_payment.invalid_amendment_type')
        }
        const { amendment_type_ids: amendmentTypeIds, ...subtypeValues } = body
        const result = await trx.insertInto('Transfer_Payment_Amendment_Subtype').values({
          ...subtypeValues, egcs_tp_transferpaymentstream: streamId, _deleted: false
        }).returningAll().executeTakeFirstOrThrow()
        await trx.insertInto('Transfer_Payment_Amendment_Subtype_Type').values(amendmentTypeIds.map(typeId => ({
          egcs_tp_amendmentsubtype: result.id, egcs_tp_amendmenttype: typeId, _deleted: false
        }))).execute()
        return { ...result, amendment_type_ids: amendmentTypeIds }
      }
    )
  } catch (error) {
    return await throwIfTransferPaymentUniqueConstraintError(event, error)
  }
})
