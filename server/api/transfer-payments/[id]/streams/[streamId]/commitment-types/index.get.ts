import { authorize } from '~~/server/utils/authorize'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { PaginationSchema } from '~~/shared/types/schemas/common'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
  if (!streamContext) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'read', createTransferPaymentScopedAuthorizeHandler('read', streamContext.scope, db))

  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  const offset = (page - 1) * limit
  let query = db.selectFrom('Transfer_Payment_Stream_Commitment_Type')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Stream_Commitment_Type.egcs_tp_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .where('Transfer_Payment_Stream_Commitment_Type.egcs_tp_transferpaymentstream', '=', streamId)
    .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
    .where('Transfer_Payment_Stream_Commitment_Type._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`
    query = query.where(eb => eb.or([
      eb('Transfer_Payment_Stream_Commitment_Type.egcs_tp_name_en', 'ilike', pattern),
      eb('Transfer_Payment_Stream_Commitment_Type.egcs_tp_name_fr', 'ilike', pattern)
    ]))
  }

  const [items, count] = await Promise.all([
    query.selectAll('Transfer_Payment_Stream_Commitment_Type').orderBy('Transfer_Payment_Stream_Commitment_Type.id').limit(limit).offset(offset).execute(),
    query.select(eb => eb.fn.count('Transfer_Payment_Stream_Commitment_Type.id').as('total')).executeTakeFirst()
  ])
  const total = Number(count?.total ?? 0)
  return { items, total, stats: { total, active: total }, page, limit }
})
