import { authorize } from '~~/server/utils/authorize'
import { notFound } from '~~/server/utils/api-errors'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { assertTransferPaymentStreamSetupExists, isTransferPaymentStreamSetupPatchRouteContext, prepareTransferPaymentStreamSetupPatchRoute, readTransferPaymentStreamSetupPatchBody } from '~~/server/utils/transfer-payment-stream-setup-routes'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { TransferPaymentStreamCommitmentTypePatchSchema } from '~~/shared/types/schemas/transfer-payment'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (profileId && streamId && !await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }
  const context = await prepareTransferPaymentStreamSetupPatchRoute(event, db, { childParam: 'commitmentTypeId' })
  if (!isTransferPaymentStreamSetupPatchRouteContext(context)) return context
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', context.streamContext.scope, db))
  const body = await readTransferPaymentStreamSetupPatchBody(event, TransferPaymentStreamCommitmentTypePatchSchema)
  try {
    return await executeFreshAuthorizedTransferPaymentStreamWrite(event, db, context.profileId, context.streamContext.agencyId, context.streamId, 'update', async trx => {
      await assertTransferPaymentStreamSetupExists(event, trx.selectFrom('Transfer_Payment_Stream_Commitment_Type')
        .select('id').where('id', '=', context.childId).where('egcs_tp_transferpaymentstream', '=', context.streamId)
        .where('_deleted', '=', false).forUpdate().executeTakeFirst(), 'COMMITMENT_TYPE_NOT_FOUND', 'apiErrors.transfer_payment.commitment_type_not_found')
      return await trx.updateTable('Transfer_Payment_Stream_Commitment_Type').set(body)
        .where('id', '=', context.childId).where('egcs_tp_transferpaymentstream', '=', context.streamId)
        .where('_deleted', '=', false).returningAll().executeTakeFirstOrThrow()
    })
  } catch (error) {
    return await throwIfTransferPaymentUniqueConstraintError(event, error)
  }
})
