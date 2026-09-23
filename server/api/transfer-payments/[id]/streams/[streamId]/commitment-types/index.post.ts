import { authorize } from '~~/server/utils/authorize'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { TransferPaymentStreamCommitmentTypeSchema } from '~~/shared/types/schemas/transfer-payment'
import { findAgencyCommitmentType } from '~~/server/utils/agency-finance-catalog'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const streamContext = await authorizeTransferPaymentStreamResource(event, 'create', profileId, streamId)
  if (!streamContext) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'create', createTransferPaymentScopedAuthorizeHandler('create', streamContext.scope, db))
  const body = await readValidatedBodyI18n(event, TransferPaymentStreamCommitmentTypeSchema)

  try {
    return await executeFreshAuthorizedTransferPaymentStreamWrite(event, db, profileId, streamContext.agencyId, streamId, 'create', async trx => {
      const type = await findAgencyCommitmentType(trx, String(body.egcs_tp_agencycommitmenttype), streamContext.agencyId)
      if (!type) return await notFound(event, 'COMMITMENT_TYPE_NOT_FOUND', 'apiErrors.transfer_payment.commitment_type_not_found')
      return await trx.insertInto('Transfer_Payment_Stream_Commitment_Type').values({
        ...body,
        egcs_tp_transferpaymentstream: streamId,
        _deleted: false
      }).returningAll().executeTakeFirstOrThrow()
    })
  } catch (error) {
    return await throwIfTransferPaymentUniqueConstraintError(event, error)
  }
})
