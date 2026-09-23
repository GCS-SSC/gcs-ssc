import { TransferPaymentMonitorTypeSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import {
  assertTransferPaymentStreamSetupExists,
  isTransferPaymentStreamSetupPatchRouteContext,
  prepareTransferPaymentStreamSetupPatchRoute,
  readTransferPaymentStreamSetupPatchBody
} from '~~/server/utils/transfer-payment-stream-setup-routes'
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
  const preliminaryStreamId = getRouterParam(event, 'streamId')
  if (profileId && preliminaryStreamId) {
    const access = await authorizeTransferPaymentStreamResource(event, 'update', profileId, preliminaryStreamId)
    if (!access) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }
  const routeContext = await prepareTransferPaymentStreamSetupPatchRoute(event, db, {
    childParam: 'monitorTypeId'
  })
  if (!isTransferPaymentStreamSetupPatchRouteContext(routeContext)) {
    return routeContext
  }

  const { streamId, childId: monitorTypeId, streamContext } = routeContext
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', streamContext.scope, db))

  await assertTransferPaymentStreamSetupExists(
    event,
    db
      .selectFrom('Transfer_Payment_Monitor_Type')
      .where('id', '=', monitorTypeId)
      .where('egcs_tp_transferpaymentstream', '=', streamId)
      .where('_deleted', '=', false)
      .select(['id', 'egcs_tp_agencymonitortype'])
      .executeTakeFirst(),
    'MONITOR_TYPE_NOT_FOUND',
    'apiErrors.transfer_payment.monitor_type_not_found'
  )

  const patchSchema = TransferPaymentMonitorTypeSchema.partial()
  const payload = await readTransferPaymentStreamSetupPatchBody(event, patchSchema)

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, routeContext.profileId, streamContext.agencyId, streamId, 'update', async (trx) => {
      const current = await assertTransferPaymentStreamSetupExists(
        event,
        trx.selectFrom('Transfer_Payment_Monitor_Type').selectAll().where('id', '=', monitorTypeId)
          .where('egcs_tp_transferpaymentstream', '=', streamId).where('_deleted', '=', false)
          .forUpdate().executeTakeFirst(),
        'MONITOR_TYPE_NOT_FOUND', 'apiErrors.transfer_payment.monitor_type_not_found'
      )
      if (payload.egcs_tp_agencymonitortype && String(current.egcs_tp_agencymonitortype) !== payload.egcs_tp_agencymonitortype) {
        return await badRequest(event, 'TRANSFER_PAYMENT_CATALOG_LINK_IMMUTABLE', 'apiErrors.transfer_payment.catalog_link_immutable')
      }
      return current
    }
  )
})
