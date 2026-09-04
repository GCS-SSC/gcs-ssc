import { PaginationSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { escapeLikePattern } from '~~/server/utils/sql-like'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const transferPaymentId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!transferPaymentId || !streamId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'read', transferPaymentId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'read', createTransferPaymentScopedAuthorizeHandler('read', streamContext.scope, db))

  const query = await getValidatedQueryI18n(event, PaginationSchema)
  const { page, limit, search } = query
  const offset = (page - 1) * limit
  const escapedSearch = search ? escapeLikePattern(search) : ''

  let baseQuery = db
    .selectFrom('Transfer_Payment_Agreement_Subtype')
    .innerJoin(
      'Agency_Agreement_Type',
      'Agency_Agreement_Type.id',
      'Transfer_Payment_Agreement_Subtype.egcs_tp_agreementtype'
    )
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Agreement_Subtype.egcs_tp_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .where('Transfer_Payment_Agreement_Subtype.egcs_tp_transferpaymentstream', '=', streamId)
    .where('Transfer_Payment_Agreement_Subtype._deleted', '=', false)
    .where('Agency_Agreement_Type._deleted', '=', false)
    .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', transferPaymentId)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)

  if (escapedSearch) {
    baseQuery = baseQuery.where(eb =>
      eb.or([
        eb('Agency_Agreement_Type.egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
        eb('Agency_Agreement_Type.egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`)
      ])
    )
  }

  const [items, countResult] = await Promise.all([
    baseQuery
      .select([
        'Transfer_Payment_Agreement_Subtype.id as id',
        'Transfer_Payment_Agreement_Subtype.egcs_tp_agreementtype as egcs_tp_agreementtype',
        'Transfer_Payment_Agreement_Subtype.egcs_tp_transferpaymentstream as egcs_tp_transferpaymentstream',
        'Agency_Agreement_Type.egcs_ay_name_en as agreement_name_en',
        'Agency_Agreement_Type.egcs_ay_name_fr as agreement_name_fr',
        'Agency_Agreement_Type.egcs_ay_agreementtype as agreement_type'
      ])
      .orderBy('Transfer_Payment_Agreement_Subtype.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('Transfer_Payment_Agreement_Subtype.id').as('total')).executeTakeFirst()
  ])

  const total = Number(countResult?.total || 0)

  return {
    items,
    total,
    stats: {
      total,
      active: total
    },
    page,
    limit
  }
})
