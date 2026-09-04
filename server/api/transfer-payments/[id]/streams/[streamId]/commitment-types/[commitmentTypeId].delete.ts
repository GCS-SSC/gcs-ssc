import { authorize } from '~~/server/utils/authorize'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { assertTransferPaymentStreamSetupExists, isTransferPaymentStreamSetupPatchRouteContext, prepareTransferPaymentStreamSetupPatchRoute } from '~~/server/utils/transfer-payment-stream-setup-routes'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (profileId && streamId && !await authorizeTransferPaymentStreamResource(event, 'delete', profileId, streamId)) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }
  const context = await prepareTransferPaymentStreamSetupPatchRoute(event, db, { childParam: 'commitmentTypeId' })
  if (!isTransferPaymentStreamSetupPatchRouteContext(context)) return context
  await authorize(event, 'transfer_payment', 'delete', createTransferPaymentScopedAuthorizeHandler('delete', context.streamContext.scope, db))

  return await executeFreshAuthorizedTransferPaymentStreamWrite(event, db, context.profileId, context.streamContext.agencyId, context.streamId, 'delete', async trx => {
    await assertTransferPaymentStreamSetupExists(event, trx.selectFrom('Transfer_Payment_Stream_Commitment_Type')
      .select('id').where('id', '=', context.childId).where('egcs_tp_transferpaymentstream', '=', context.streamId)
      .where('_deleted', '=', false).forUpdate().executeTakeFirst(), 'COMMITMENT_TYPE_NOT_FOUND', 'apiErrors.transfer_payment.commitment_type_not_found')
    const reference = await trx.selectFrom('Funding_Case_Agreement_Commitment').select('id')
      .where('egcs_fc_type', '=', context.childId).where('_deleted', '=', false)
      .forUpdate().executeTakeFirst()
    if (reference) return await badRequest(event, 'TRANSFER_PAYMENT_COMMITMENT_TYPE_IN_USE', 'apiErrors.transfer_payment.commitment_type_in_use')
    await trx.updateTable('Transfer_Payment_Stream_Commitment_Type').set({ _deleted: true })
      .where('id', '=', context.childId).where('egcs_tp_transferpaymentstream', '=', context.streamId)
      .where('_deleted', '=', false).execute()
    return { success: true }
  })
})
