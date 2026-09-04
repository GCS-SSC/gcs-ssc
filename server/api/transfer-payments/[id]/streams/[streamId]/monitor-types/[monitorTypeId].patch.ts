import { TransferPaymentMonitorTypeSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import {
  assertTransferPaymentStreamSetupExists,
  executeTransferPaymentStreamSetupUpdate,
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
      .select(['id', 'egcs_tp_name_en', 'egcs_tp_name_fr'])
      .executeTakeFirst(),
    'MONITOR_TYPE_NOT_FOUND',
    'apiErrors.transfer_payment.monitor_type_not_found'
  )

  const patchSchema = TransferPaymentMonitorTypeSchema.omit({
    egcs_tp_transferpaymentstream: true
  }).partial()
  const payload = await readTransferPaymentStreamSetupPatchBody(event, patchSchema)

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, routeContext.profileId, streamContext.agencyId, streamId, 'update', async trx => {
      await assertTransferPaymentStreamSetupExists(
        event,
        trx.selectFrom('Transfer_Payment_Monitor_Type').select('id').where('id', '=', monitorTypeId)
          .where('egcs_tp_transferpaymentstream', '=', streamId).where('_deleted', '=', false)
          .forUpdate().executeTakeFirst(),
        'MONITOR_TYPE_NOT_FOUND', 'apiErrors.transfer_payment.monitor_type_not_found'
      )
      return await executeTransferPaymentStreamSetupUpdate(event, trx
        .updateTable('Transfer_Payment_Monitor_Type')
        .set(payload)
        .where('id', '=', monitorTypeId)
        .where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false)
        .returningAll()
        .executeTakeFirstOrThrow())
    }
  )
})
