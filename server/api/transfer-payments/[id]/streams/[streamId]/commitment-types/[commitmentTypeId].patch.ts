import { authorize } from '~~/server/utils/authorize'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { assertTransferPaymentStreamSetupExists, isTransferPaymentStreamSetupPatchRouteContext, prepareTransferPaymentStreamSetupPatchRoute } from '~~/server/utils/transfer-payment-stream-setup-routes'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (profileId && streamId && !await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }
  const context = await prepareTransferPaymentStreamSetupPatchRoute(event, db, { childParam: 'commitmentTypeId' })
  if (!isTransferPaymentStreamSetupPatchRouteContext(context)) return context
  await assertTransferPaymentStreamSetupExists(event, db.selectFrom('Transfer_Payment_Stream_Commitment_Type')
    .select('id').where('id', '=', context.childId).where('egcs_tp_transferpaymentstream', '=', context.streamId)
    .where('_deleted', '=', false).executeTakeFirst(), 'COMMITMENT_TYPE_NOT_FOUND', 'apiErrors.transfer_payment.commitment_type_not_found')
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', context.streamContext.scope, db))
  return await badRequest(event, 'TRANSFER_PAYMENT_CATALOG_LINK_IMMUTABLE', 'apiErrors.transfer_payment.catalog_link_immutable')
})
