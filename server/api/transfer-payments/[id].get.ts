import { authorizeWithFreshAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { authorizeTransferPaymentProfileResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const id = getRouterParam(event, 'id')
  if (!id) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const access = await authorizeTransferPaymentProfileResource(event, 'read', id)
  if (!access) {
    return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
  }
  const profile = await db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx)
    await authorizeWithFreshAuthContext(
      event,
      authContext,
      'transfer_payment',
      'read',
      createTransferPaymentScopedAuthorizeHandler('read', {
        type: 'entity',
        agencyId: access.agencyId,
        path: [{ type: 'transfer_payment', id }]
      }, trx)
    )
    return await trx
      .selectFrom('Transfer_Payment_Profile')
      .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
      .where('Transfer_Payment_Profile.id', '=', id)
      .where('Transfer_Payment_Profile.egcs_tp_agency', '=', access.agencyId)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .where('Agency_Profile._deleted', '=', false)
      .selectAll('Transfer_Payment_Profile')
      .executeTakeFirst()
  })

  if (!profile) {
    return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
  }

  return profile
})
