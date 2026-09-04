import { authorize } from '~~/server/utils/authorize'
import { createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { createStreamDocumentTemplate } from '~~/server/utils/document-template-routes'
import { resolveTransferPaymentAgreementSubtypeStreamScopeContext } from '~~/server/utils/transfer-payment-agreement-subtypes'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const transferPaymentId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!transferPaymentId || !streamId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const streamContext = await resolveTransferPaymentAgreementSubtypeStreamScopeContext(transferPaymentId, streamId, db)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'create', createTransferPaymentScopedAuthorizeHandler('create', streamContext.scope, db))

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, transferPaymentId, streamContext.agencyId, streamId, 'create',
    async (trx, freshContext) => await createStreamDocumentTemplate(event, trx, freshContext.agencyId, streamId)
  )
})
