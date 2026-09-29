import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'

// eslint-disable-next-line local/require-authorize -- delegated to authorizeTransferPaymentStreamResource
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const linkId = getRouterParam(event, 'linkId')
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!linkId || !isPositivePostgresBigintText(linkId)) return await notFound(event, 'FUNDING_SUBTYPE_LINK_NOT_FOUND', 'apiErrors.transfer_payment.funding_subtype_link_not_found')
  const context = await authorizeTransferPaymentStreamResource(event, 'delete', profileId, streamId)
  if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  return await executeFreshAuthorizedTransferPaymentStreamWrite(event, db, profileId, context.agencyId, streamId, 'delete', async trx => {
    const link = await trx.selectFrom('Transfer_Payment_Stream_Funding_Subtype').selectAll().where('id', '=', linkId)
      .where('egcs_tp_transferpaymentstream', '=', streamId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!link) return await notFound(event, 'FUNDING_SUBTYPE_LINK_NOT_FOUND', 'apiErrors.transfer_payment.funding_subtype_link_not_found')
    await trx.updateTable('Transfer_Payment_Stream_Funding_Subtype').set({ _deleted: true }).where('id', '=', linkId).execute()
    return { success: true }
  })
})
