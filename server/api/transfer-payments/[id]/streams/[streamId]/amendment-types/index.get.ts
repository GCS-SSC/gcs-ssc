import { sql } from 'kysely'
import { PaginationSchema } from '~~/shared/types/schemas/common'
import { authorize } from '~~/server/utils/authorize'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'

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

  const query = await getValidatedQueryI18n(event, PaginationSchema)
  const { page, limit, search } = query
  const offset = (page - 1) * limit

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'read', createTransferPaymentScopedAuthorizeHandler('read', streamContext.scope, db))

  let baseQuery = db
    .selectFrom('Transfer_Payment_Amendment_Type')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Amendment_Type.egcs_tp_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .where('Transfer_Payment_Amendment_Type.egcs_tp_transferpaymentstream', '=', streamId)
    .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
    .where('Transfer_Payment_Amendment_Type._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)

  if (search) {
    baseQuery = baseQuery.where(eb =>
      eb.or([
        eb(sql<string>`CAST(${eb.ref('id')} AS TEXT)`, '=', search),
        eb('egcs_tp_name_en', 'ilike', `%${escapeLikePattern(search)}%`),
        eb('egcs_tp_name_fr', 'ilike', `%${escapeLikePattern(search)}%`)
      ])
    )
  }

  const [items, countResult, statsResult] = await Promise.all([
    baseQuery.selectAll('Transfer_Payment_Amendment_Type')
      .orderBy('Transfer_Payment_Amendment_Type.id', 'asc').limit(limit).offset(offset).execute(),
    baseQuery.select(eb => eb.fn.count('Transfer_Payment_Amendment_Type.id').as('total')).executeTakeFirst(),
    db
      .selectFrom('Transfer_Payment_Amendment_Type')
      .where('egcs_tp_transferpaymentstream', '=', streamId)
      .where('_deleted', '=', false)
      .select(eb => eb.fn.count('id').as('total'))
      .executeTakeFirst()
  ])

  const total = Number(countResult?.total ?? 0)
  const globalTotal = Number(statsResult?.total ?? 0)

  return {
    items,
    total,
    stats: {
      total: globalTotal,
      active: globalTotal
    },
    page,
    limit
  }
})
