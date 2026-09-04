import { PaginationSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const context = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
  if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'read', createTransferPaymentScopedAuthorizeHandler('read', context.scope, db))
  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  let query = db.selectFrom('Transfer_Payment_Stream_Holdback_Basis')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Stream_Holdback_Basis.egcs_tp_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .innerJoin('Agency_Holdback_Basis', 'Agency_Holdback_Basis.id', 'Transfer_Payment_Stream_Holdback_Basis.egcs_tp_agencyholdback')
    .where('Transfer_Payment_Stream_Holdback_Basis.egcs_tp_transferpaymentstream', '=', streamId)
    .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
    .whereRef('Agency_Holdback_Basis.egcs_ay_organizationagency', '=', 'Transfer_Payment_Profile.egcs_tp_agency')
    .where('Transfer_Payment_Stream_Holdback_Basis._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
    .where('Agency_Holdback_Basis._deleted', '=', false)
  if (search) query = query.where(eb => eb.or([
    eb('Transfer_Payment_Stream_Holdback_Basis.egcs_tp_name_en', 'ilike', `%${escapeLikePattern(search)}%`),
    eb('Transfer_Payment_Stream_Holdback_Basis.egcs_tp_name_fr', 'ilike', `%${escapeLikePattern(search)}%`)
  ]))
  const [items, count] = await Promise.all([
    query.select([
      'Transfer_Payment_Stream_Holdback_Basis.id', 'egcs_tp_transferpaymentstream', 'egcs_tp_agencyholdback',
      'Transfer_Payment_Stream_Holdback_Basis.egcs_tp_name_en', 'Transfer_Payment_Stream_Holdback_Basis.egcs_tp_name_fr',
      'Agency_Holdback_Basis.egcs_ay_languageindependentcode'
    ]).orderBy('Transfer_Payment_Stream_Holdback_Basis.id', 'asc').limit(limit).offset((page - 1) * limit).execute(),
    query.select(eb => eb.fn.count('Transfer_Payment_Stream_Holdback_Basis.id').as('total')).executeTakeFirst()
  ])
  const total = Number(count?.total ?? 0)
  return { items, total, stats: { total, active: total }, page, limit }
})
