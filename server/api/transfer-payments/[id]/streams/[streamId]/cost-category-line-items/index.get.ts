import { PaginationSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeTransferPaymentStreamReadScope, resolveTransferPaymentStreamScopeContextForRoute } from '~~/server/utils/transfer-payment-stream-scope'
import { buildListRouteResponse } from '~~/server/utils/list-route-response'
import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'

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
  if (!profileId || !streamId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  const access = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
  if (!access) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')

  const streamContext = await resolveTransferPaymentStreamScopeContextForRoute(event, profileId, streamId, db)
  if ('statusCode' in streamContext) return streamContext

  await authorize(event, 'transfer_payment', 'read', async ({ context }) => {
    return await authorizeTransferPaymentStreamReadScope(streamContext.scope, db, context)
  })

  const query = await getValidatedQueryI18n(event, PaginationSchema)
  const { page, limit, search } = query
  const offset = (page - 1) * limit

  let baseQuery = db
    .selectFrom('Transfer_Payment_Stream_Cost_Category_Line_Item')
    .innerJoin(
      'Agency_Cost_Category_Line_Item',
      'Agency_Cost_Category_Line_Item.id',
      'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_organizationcostcategory'
    )
    .innerJoin('Agency_Cost_Category', 'Agency_Cost_Category.id', 'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .where('Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_transferpaymentstream', '=', streamId)
    .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
    .whereRef('Agency_Cost_Category.egcs_ay_organizationagency', '=', 'Transfer_Payment_Profile.egcs_tp_agency')
    .where('Transfer_Payment_Stream_Cost_Category_Line_Item._deleted', '=', false)
    .where('Agency_Cost_Category_Line_Item._deleted', '=', false)
    .where('Agency_Cost_Category._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)

  if (search) {
    baseQuery = baseQuery.where(eb =>
      eb.or([
        eb('Agency_Cost_Category_Line_Item.egcs_ay_name_en', 'ilike', `%${escapeLikePattern(search)}%`),
        eb('Agency_Cost_Category_Line_Item.egcs_ay_name_fr', 'ilike', `%${escapeLikePattern(search)}%`)
      ])
    )
  }

  const [items, countResult, statsResult] = await Promise.all([
    baseQuery
      .select([
        'Transfer_Payment_Stream_Cost_Category_Line_Item.id as id',
        'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_transferpaymentstream as egcs_tp_transferpaymentstream',
        'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_organizationcostcategory as egcs_tp_organizationcostcategory',
        'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_costsharingratio as egcs_tp_costsharingratio',
        'Agency_Cost_Category_Line_Item.egcs_ay_name_en as line_item_name_en',
        'Agency_Cost_Category_Line_Item.egcs_ay_name_fr as line_item_name_fr'
      ])
      .orderBy('Transfer_Payment_Stream_Cost_Category_Line_Item.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery
      .select(eb => eb.fn.count('Transfer_Payment_Stream_Cost_Category_Line_Item.id').as('total'))
      .executeTakeFirst(),
    db
      .selectFrom('Transfer_Payment_Stream_Cost_Category_Line_Item')
      .innerJoin(
        'Agency_Cost_Category_Line_Item',
        'Agency_Cost_Category_Line_Item.id',
        'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_organizationcostcategory'
      )
      .innerJoin('Agency_Cost_Category', 'Agency_Cost_Category.id', 'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory')
      .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_transferpaymentstream')
      .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
      .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
      .where('Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_transferpaymentstream', '=', streamId)
      .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
      .whereRef('Agency_Cost_Category.egcs_ay_organizationagency', '=', 'Transfer_Payment_Profile.egcs_tp_agency')
      .where('Transfer_Payment_Stream_Cost_Category_Line_Item._deleted', '=', false)
      .where('Agency_Cost_Category_Line_Item._deleted', '=', false)
      .where('Agency_Cost_Category._deleted', '=', false)
      .where('Transfer_Payment_Stream._deleted', '=', false)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .where('Agency_Profile._deleted', '=', false)
      .select(eb => eb.fn.count('Transfer_Payment_Stream_Cost_Category_Line_Item.id').as('total'))
      .executeTakeFirst()
  ])

  return buildListRouteResponse(items, countResult, statsResult, page, limit)
})
