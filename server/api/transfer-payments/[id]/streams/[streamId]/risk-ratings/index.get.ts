import { PaginationSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { escapeLikePattern } from '~~/server/utils/sql-like'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')

  if (!profileId || !streamId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'read', createTransferPaymentScopedAuthorizeHandler('read', streamContext.scope, db))

  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  const offset = (page - 1) * limit
  const escapedSearch = search ? escapeLikePattern(search) : ''

  let baseQuery = db
    .selectFrom('Transfer_Payment_Stream_Risk_Rating')
    .where('egcs_tp_transferpaymentstream', '=', streamId)
    .where('_deleted', '=', false)

  if (escapedSearch) {
    const scoreSearch = Number(escapedSearch)
    baseQuery = baseQuery.where(eb => eb.or([
      eb('egcs_tp_name_en', 'ilike', `%${escapedSearch}%`),
      eb('egcs_tp_name_fr', 'ilike', `%${escapedSearch}%`),
      ...(Number.isFinite(scoreSearch) ? [eb('egcs_tp_riskscore', '=', scoreSearch)] : [])
    ]))
  }

  const [items, countResult, statsResult] = await Promise.all([
    baseQuery.selectAll().orderBy('egcs_tp_riskscore', 'asc').limit(limit).offset(offset).execute(),
    baseQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst(),
    db
      .selectFrom('Transfer_Payment_Stream_Risk_Rating')
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
