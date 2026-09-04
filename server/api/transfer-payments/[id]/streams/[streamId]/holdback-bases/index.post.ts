import { TransferPaymentStreamHoldbackBasisSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const context = await authorizeTransferPaymentStreamResource(event, 'create', profileId, streamId)
  if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'create', createTransferPaymentScopedAuthorizeHandler('create', context.scope, db))
  const body = await readValidatedBodyI18n(event, TransferPaymentStreamHoldbackBasisSchema)
  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, context.agencyId, streamId, 'create', async (trx, freshContext) => {
      const agencyBasis = await trx.selectFrom('Agency_Holdback_Basis').select('id')
        .where('id', '=', body.egcs_tp_agencyholdback).where('egcs_ay_organizationagency', '=', freshContext.agencyId)
        .where('_deleted', '=', false).forUpdate().executeTakeFirst()
      if (!agencyBasis) return await badRequest(event, 'INVALID_HOLDBACK_BASIS', 'apiErrors.transfer_payment.invalid_holdback_basis')
      try {
        return await trx.insertInto('Transfer_Payment_Stream_Holdback_Basis')
          .values({ ...body, egcs_tp_transferpaymentstream: streamId }).returningAll().executeTakeFirstOrThrow()
      } catch (error) {
        return await throwIfTransferPaymentUniqueConstraintError(event, error)
      }
    }
  )
})
