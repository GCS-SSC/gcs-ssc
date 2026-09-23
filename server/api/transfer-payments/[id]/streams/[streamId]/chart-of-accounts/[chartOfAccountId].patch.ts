import { authorize } from '~~/server/utils/authorize'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import {
  assertTransferPaymentStreamSetupExists,
  isTransferPaymentStreamSetupPatchRouteContext,
  prepareTransferPaymentStreamSetupPatchRoute
} from '~~/server/utils/transfer-payment-stream-setup-routes'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const preliminaryProfileId = getRouterParam(event, 'id')
  const preliminaryStreamId = getRouterParam(event, 'streamId')
  if (preliminaryProfileId && preliminaryStreamId) {
    const access = await authorizeTransferPaymentStreamResource(event, 'update', preliminaryProfileId, preliminaryStreamId)
    if (!access) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  const routeContext = await prepareTransferPaymentStreamSetupPatchRoute(event, db, { childParam: 'chartOfAccountId' })
  if (!isTransferPaymentStreamSetupPatchRouteContext(routeContext)) return routeContext

  await assertTransferPaymentStreamSetupExists(
    event,
    db.selectFrom('Transfer_Payment_Stream_Chart_of_Account')
      .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Stream_Chart_of_Account.egcs_tp_transferpaymentstream')
      .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
      .where('Transfer_Payment_Stream_Chart_of_Account.id', '=', routeContext.childId)
      .where('Transfer_Payment_Stream_Chart_of_Account.egcs_tp_transferpaymentstream', '=', routeContext.streamId)
      .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', routeContext.profileId)
      .where('Transfer_Payment_Stream_Chart_of_Account._deleted', '=', false)
      .where('Transfer_Payment_Stream._deleted', '=', false)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .select('Transfer_Payment_Stream_Chart_of_Account.id')
      .executeTakeFirst(),
    'CHART_OF_ACCOUNT_NOT_FOUND',
    'apiErrors.transfer_payment.chart_of_account_not_found'
  )

  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', routeContext.streamContext.scope, db))
  return await badRequest(event, 'TRANSFER_PAYMENT_CATALOG_LINK_IMMUTABLE', 'apiErrors.transfer_payment.catalog_link_immutable')
})
