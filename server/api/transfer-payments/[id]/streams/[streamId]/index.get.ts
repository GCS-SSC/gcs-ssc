import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
// eslint-disable-next-line local/require-authorize -- delegated to authorizeTransferPaymentStreamResource
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const access = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
  if (!access) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  const stream = await db
    .selectFrom('Transfer_Payment_Stream')
    .innerJoin(
      'Transfer_Payment_Profile',
      'Transfer_Payment_Profile.id',
      'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
    )
    .leftJoin('Transfer_Payment_Stream as parent', 'parent.id', 'Transfer_Payment_Stream.egcs_tp_parentstream')
    .where('Transfer_Payment_Stream.id', '=', streamId)
    .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Transfer_Payment_Profile.egcs_tp_agency', '=', access.agencyId)
    .select([
      'Transfer_Payment_Stream.id as id',
      'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile as egcs_tp_transferpaymentprofile',
      'Transfer_Payment_Stream.egcs_tp_parentstream as egcs_tp_parentstream',
      'Transfer_Payment_Stream.egcs_tp_name_en as egcs_tp_name_en',
      'Transfer_Payment_Stream.egcs_tp_name_fr as egcs_tp_name_fr',
      'Transfer_Payment_Stream.egcs_tp_description_en as egcs_tp_description_en',
      'Transfer_Payment_Stream.egcs_tp_description_fr as egcs_tp_description_fr',
      'Transfer_Payment_Stream.egcs_tp_abbreviation_en as egcs_tp_abbreviation_en',
      'Transfer_Payment_Stream.egcs_tp_abbreviation_fr as egcs_tp_abbreviation_fr',
      'Transfer_Payment_Stream.egcs_tp_objective_en as egcs_tp_objective_en',
      'Transfer_Payment_Stream.egcs_tp_objective_fr as egcs_tp_objective_fr',
      'Transfer_Payment_Stream.egcs_tp_allowsfurtherdistribution as egcs_tp_allowsfurtherdistribution',
      'Transfer_Payment_Stream.egcs_tp_active as egcs_tp_active',
      'parent.egcs_tp_name_en as parent_name_en',
      'parent.egcs_tp_name_fr as parent_name_fr',
      'Transfer_Payment_Profile.egcs_tp_agency as agency_id'
    ])
    .executeTakeFirst()

  if (!stream) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  const { agency_id, ...payload } = stream
  return payload
})
