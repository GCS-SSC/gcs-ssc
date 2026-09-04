import { TransferPaymentStreamAreaOfExpertiseSchema } from '~~/shared/types/schemas/transfer-payment'
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
  const preliminaryProfileId = getRouterParam(event, 'id')
  const preliminaryStreamId = getRouterParam(event, 'streamId')
  if (preliminaryProfileId && preliminaryStreamId) {
    const access = await authorizeTransferPaymentStreamResource(event, 'update', preliminaryProfileId, preliminaryStreamId)
    if (!access) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }
  const routeContext = await prepareTransferPaymentStreamSetupPatchRoute(event, db, {
    childParam: 'areaOfExpertiseId'
  })
  if (!isTransferPaymentStreamSetupPatchRouteContext(routeContext)) {
    return routeContext
  }

  const { profileId, streamId, childId: areaOfExpertiseId, streamContext } = routeContext
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', streamContext.scope, db))

  const patchSchema = TransferPaymentStreamAreaOfExpertiseSchema.omit({
    egcs_tp_transferpaymentstream: true
  }).partial()
  const payload = await readTransferPaymentStreamSetupPatchBody(event, patchSchema)

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'update', async trx => {
      await assertTransferPaymentStreamSetupExists(event, trx
        .selectFrom('Transfer_Payment_Stream_Area_of_Expertise')
        .where('id', '=', areaOfExpertiseId).where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false).select(['id', 'egcs_tp_name_en', 'egcs_tp_name_fr'])
        .forUpdate().executeTakeFirst(), 'AREA_OF_EXPERTISE_NOT_FOUND', 'apiErrors.transfer_payment.area_of_expertise_not_found')
      return await executeTransferPaymentStreamSetupUpdate(event, trx
        .updateTable('Transfer_Payment_Stream_Area_of_Expertise').set(payload)
        .where('id', '=', areaOfExpertiseId).where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false).returningAll().executeTakeFirstOrThrow())
    }
  )
})
