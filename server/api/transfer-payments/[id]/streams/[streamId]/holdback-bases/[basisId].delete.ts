import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const basisId = getRouterParam(event, 'basisId')
  if (!profileId || !streamId || !basisId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(basisId)) return await notFound(event, 'HOLDBACK_BASIS_NOT_FOUND', 'apiErrors.transfer_payment.holdback_basis_not_found')
  const context = await authorizeTransferPaymentStreamResource(event, 'delete', profileId, streamId)
  if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'delete', createTransferPaymentScopedAuthorizeHandler('delete', context.scope, db))
  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, context.agencyId, streamId, 'delete', async trx => {
      const reference = await trx.selectFrom('Funding_Case_Agreement_Profile').select('id')
        .where('egcs_fc_holdbackbasis', '=', basisId).where('_deleted', '=', false)
        .forUpdate().executeTakeFirst()
      if (reference) {
        return await badRequest(event, 'HOLDBACK_BASIS_IN_USE', 'apiErrors.transfer_payment.holdback_basis_in_use')
      }
      const deleted = await trx.updateTable('Transfer_Payment_Stream_Holdback_Basis').set({ _deleted: true })
        .where('id', '=', basisId).where('egcs_tp_transferpaymentstream', '=', streamId).where('_deleted', '=', false)
        .returning('id').executeTakeFirst()
      if (!deleted) return await notFound(event, 'HOLDBACK_BASIS_NOT_FOUND', 'apiErrors.transfer_payment.holdback_basis_not_found')
      return { success: true }
    }
  )
})
