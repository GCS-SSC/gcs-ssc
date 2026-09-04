import { authorize } from '~~/server/utils/authorize'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { retirePublication } from '~~/server/utils/system-publication'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const setupId = getRouterParam(event, 'reviewSetupId')
  if (!profileId || !streamId || !setupId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const context = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', context.scope, db))
  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, context.agencyId, streamId, 'update', async trx => {
      const setup = await trx.selectFrom('Common_Review_Set_Setup').select('id').where('id', '=', setupId)
        .where('egcs_cn_scopetype', '=', 'transferpaymentstream').where('egcs_cn_scopeid', '=', streamId)
        .where('_deleted', '=', false).forUpdate().executeTakeFirst()
      if (!setup) return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
      const actor = await resolveCurrentCommonUser(event, trx)
      if (!actor) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
      return await retirePublication(trx, { publicationId: setupId, kind: 'review_set_setup', actorId: actor.id })
    }
  )
})
