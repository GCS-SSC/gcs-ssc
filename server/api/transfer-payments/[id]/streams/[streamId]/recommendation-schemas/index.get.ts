import { sql } from 'kysely'
import { PaginationSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'

export default defineEventHandler(async event => {
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
  if (!streamContext) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'read', createTransferPaymentScopedAuthorizeHandler('read', streamContext.scope, event.context.$db))

  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  const offset = (page - 1) * limit
  const escapedSearch = search ? escapeLikePattern(search) : null
  let rowsQuery = event.context.$db
    .selectFrom('Common_Recommendation_Schema')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Recommendation_Schema.id')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.egcs_tp_agency', 'Common_Recommendation_Schema.egcs_cn_agency')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', 'Transfer_Payment_Profile.id')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .leftJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Publication.egcs_cn_currentversion')
    .selectAll('Common_Recommendation_Schema')
    .select([
      'Common_Publication.egcs_cn_state as publicationState',
      'Common_Publication_Version.egcs_cn_version as publicationVersion'
    ])
    .where('Common_Recommendation_Schema.egcs_cn_agency', '=', streamContext.agencyId)
    .where('Transfer_Payment_Stream.id', '=', streamId)
    .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
    .where('Common_Recommendation_Schema._deleted', '=', false)
    .where('Common_Publication._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
  let countQuery = event.context.$db
    .selectFrom('Common_Recommendation_Schema')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Recommendation_Schema.id')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.egcs_tp_agency', 'Common_Recommendation_Schema.egcs_cn_agency')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', 'Transfer_Payment_Profile.id')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .select(sql<number>`count(*)`.as('total'))
    .where('Common_Recommendation_Schema.egcs_cn_agency', '=', streamContext.agencyId)
    .where('Transfer_Payment_Stream.id', '=', streamId)
    .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
    .where('Common_Recommendation_Schema._deleted', '=', false)
    .where('Common_Publication._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)

  if (escapedSearch) {
    const pattern = `%${escapedSearch}%`
    rowsQuery = rowsQuery.where(eb => eb.or([
      eb('Common_Recommendation_Schema.egcs_cn_name_en', 'ilike', pattern),
      eb('Common_Recommendation_Schema.egcs_cn_name_fr', 'ilike', pattern)
    ]))
    countQuery = countQuery.where(eb => eb.or([
      eb('Common_Recommendation_Schema.egcs_cn_name_en', 'ilike', pattern),
      eb('Common_Recommendation_Schema.egcs_cn_name_fr', 'ilike', pattern)
    ]))
  }

  const [items, count] = await Promise.all([
    rowsQuery.orderBy('Common_Recommendation_Schema.id', 'asc').limit(limit).offset(offset).execute(),
    countQuery.executeTakeFirst()
  ])
  const total = Number(count?.total ?? 0)
  return { items, total, stats: { total }, page, limit }
})
