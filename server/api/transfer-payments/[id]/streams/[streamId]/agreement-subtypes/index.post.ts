import { TransferPaymentAgreementSubtypeSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const transferPaymentId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!transferPaymentId || !streamId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'create', transferPaymentId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'create', createTransferPaymentScopedAuthorizeHandler('create', streamContext.scope, db))

  const body = await readValidatedBodyI18n(event, TransferPaymentAgreementSubtypeSchema)

  try {
    return await executeFreshAuthorizedTransferPaymentStreamWrite(
      event, db, transferPaymentId, streamContext.agencyId, streamId, 'create', async (trx, freshContext) => {
        const agreementType = await trx
          .selectFrom('Agency_Agreement_Type')
          .where('id', '=', body.egcs_tp_agreementtype)
          .where('egcs_ay_organizationagency', '=', freshContext.agencyId)
          .where('_deleted', '=', false)
          .select('id')
          .executeTakeFirst()

        if (!agreementType) {
          return await badRequest(event, 'INVALID_AGREEMENT_TYPE', 'apiErrors.transfer_payment.invalid_agreement_type')
        }

        return await trx
          .insertInto('Transfer_Payment_Agreement_Subtype')
          .values({
            egcs_tp_agreementtype: body.egcs_tp_agreementtype,
            egcs_tp_transferpaymentstream: streamId,
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
