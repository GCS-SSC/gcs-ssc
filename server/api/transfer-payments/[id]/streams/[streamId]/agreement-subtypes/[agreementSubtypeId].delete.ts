import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const transferPaymentId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const agreementSubtypeId = getRouterParam(event, 'agreementSubtypeId')

  if (!transferPaymentId || !streamId || !agreementSubtypeId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  if (!isPositivePostgresBigintText(agreementSubtypeId)) {
    return await notFound(event, 'AGREEMENT_SUBTYPE_NOT_FOUND', 'apiErrors.transfer_payment.agreement_subtype_not_found')
  }

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'delete', transferPaymentId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'delete', createTransferPaymentScopedAuthorizeHandler('delete', streamContext.scope, db))

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, transferPaymentId, streamContext.agencyId, streamId, 'delete', async trx => {
      const existing = await trx.selectFrom('Transfer_Payment_Agreement_Subtype')
        .where('id', '=', agreementSubtypeId).where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false).select('id').forUpdate().executeTakeFirst()
      if (!existing) {
        return await notFound(event, 'AGREEMENT_SUBTYPE_NOT_FOUND', 'apiErrors.transfer_payment.agreement_subtype_not_found')
      }
      const activeAgreement = await trx.selectFrom('Funding_Case_Agreement_Profile')
        .select('id')
        .where('egcs_fc_agreementsubtype', '=', agreementSubtypeId)
        .where('egcs_fc_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false)
        .orderBy('id', 'asc')
        .forUpdate()
        .executeTakeFirst()
      if (activeAgreement) {
        return await throwApiError(event, {
          statusCode: 409,
          code: 'AGREEMENT_SUBTYPE_IN_USE',
          key: 'apiErrors.request.resource_in_use'
        })
      }
      await trx.updateTable('Transfer_Payment_Agreement_Subtype').set({ _deleted: true })
        .where('id', '=', agreementSubtypeId).where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false).execute()
      return { success: true }
    }
  )
})
