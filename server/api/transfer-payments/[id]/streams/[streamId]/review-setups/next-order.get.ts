import { authorize } from '~~/server/utils/authorize'
import { createTransferPaymentScopedAuthorizeHandler, authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const transferPaymentId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')

  if (!transferPaymentId || !streamId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'create', transferPaymentId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'create', createTransferPaymentScopedAuthorizeHandler('create', streamContext.scope, db))

  const maxOrderResult = await db
    .selectFrom('Common_Review_Set_Setup')
    .select(eb => eb.fn.max('egcs_cn_order').as('maxOrder'))
    .where('egcs_cn_scopetype', '=', 'transferpaymentstream')
    .where('egcs_cn_scopeid', '=', streamId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  return {
    nextOrder: (maxOrderResult?.maxOrder ?? 0) + 1
  }
})
