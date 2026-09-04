import { PaginationSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { buildListRouteResponse } from '~~/server/utils/list-route-response'

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
  if (!access) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')

  const query = await getValidatedQueryI18n(event, PaginationSchema)
  const { page, limit, search } = query
  const offset = (page - 1) * limit

  let baseQuery = db
    .selectFrom('Transfer_Payment_Stream_Eligible_Recipient')
    .innerJoin(
      'Agency_Applicant_Recipient_Subtype',
      'Agency_Applicant_Recipient_Subtype.id',
      'Transfer_Payment_Stream_Eligible_Recipient.egcs_tp_applicantrecipientsubtype'
    )
    .where('Transfer_Payment_Stream_Eligible_Recipient.egcs_tp_transferpaymentstream', '=', streamId)
    .where('Transfer_Payment_Stream_Eligible_Recipient._deleted', '=', false)
    .where('Agency_Applicant_Recipient_Subtype._deleted', '=', false)

  if (search) {
    const escapedSearch = escapeLikePattern(search)
    baseQuery = baseQuery.where(eb =>
      eb.or([
        eb('Agency_Applicant_Recipient_Subtype.egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
        eb('Agency_Applicant_Recipient_Subtype.egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`)
      ])
    )
  }

  const [items, countResult] = await Promise.all([
    baseQuery
      .select([
        'Transfer_Payment_Stream_Eligible_Recipient.id as id',
        'Transfer_Payment_Stream_Eligible_Recipient.egcs_tp_transferpaymentstream as egcs_tp_transferpaymentstream',
        'Transfer_Payment_Stream_Eligible_Recipient.egcs_tp_applicantrecipientsubtype as egcs_tp_applicantrecipientsubtype',
        'Agency_Applicant_Recipient_Subtype.egcs_ay_name_en as recipient_name_en',
        'Agency_Applicant_Recipient_Subtype.egcs_ay_name_fr as recipient_name_fr'
      ])
      .orderBy('Transfer_Payment_Stream_Eligible_Recipient.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('Transfer_Payment_Stream_Eligible_Recipient.id').as('total')).executeTakeFirst()
  ])

  return buildListRouteResponse(items, countResult, countResult, page, limit)
})
