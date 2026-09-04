import { TransferPaymentStreamRiskRatingSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'

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

  const body = await readValidatedBodyI18n(
    event,
    TransferPaymentStreamRiskRatingSchema.omit({ egcs_tp_transferpaymentstream: true })
  )

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'create', async trx => {
      try {
        return await trx
          .insertInto('Transfer_Payment_Stream_Risk_Rating')
          .values({
            ...body,
            egcs_tp_transferpaymentstream: streamId,
            _deleted: false
          })
          .returningAll()
          .executeTakeFirstOrThrow()
      } catch (error) {
        return await throwIfTransferPaymentUniqueConstraintError(event, error)
      }
    }
  )
})
