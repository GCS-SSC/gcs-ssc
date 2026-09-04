import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const areaOfExpertiseId = getRouterParam(event, 'areaOfExpertiseId')

  if (!profileId || !streamId || !areaOfExpertiseId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  if (!isPositivePostgresBigintText(areaOfExpertiseId)) {
    return await notFound(event, 'AREA_OF_EXPERTISE_NOT_FOUND', 'apiErrors.transfer_payment.area_of_expertise_not_found')
  }

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'delete', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'delete', createTransferPaymentScopedAuthorizeHandler('delete', streamContext.scope, db))

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'delete', async trx => {
      const existing = await trx.selectFrom('Transfer_Payment_Stream_Area_of_Expertise').select('id')
        .where('id', '=', areaOfExpertiseId).where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false).forUpdate().executeTakeFirst()
      if (!existing) {
        return await notFound(event, 'AREA_OF_EXPERTISE_NOT_FOUND', 'apiErrors.transfer_payment.area_of_expertise_not_found')
      }
      await trx.updateTable('Transfer_Payment_Stream_Area_of_Expertise').set({ _deleted: true })
        .where('id', '=', areaOfExpertiseId).where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false).execute()
      return { success: true }
    }
  )
})
