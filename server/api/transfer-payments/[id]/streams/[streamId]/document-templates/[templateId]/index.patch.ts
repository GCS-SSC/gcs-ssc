import { authorize } from '~~/server/utils/authorize'
import { createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { patchStreamDocumentTemplate } from '~~/server/utils/document-template-routes'
import { deleteStoredAttachmentById } from '~~/server/utils/file-storage'
import { resolveTransferPaymentAgreementSubtypeStreamScopeContext } from '~~/server/utils/transfer-payment-agreement-subtypes'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const transferPaymentId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const templateId = getRouterParam(event, 'templateId')
  if (!transferPaymentId || !streamId || !templateId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  if (![transferPaymentId, streamId, templateId].every(isPositivePostgresBigintText)) {
    return await badRequest(event, 'INVALID_IDS', 'apiErrors.request.invalid')
  }

  const streamContext = await resolveTransferPaymentAgreementSubtypeStreamScopeContext(transferPaymentId, streamId, db)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', streamContext.scope, db))

  let replacedAttachmentIds: string[] = []
  const updated = await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, transferPaymentId, streamContext.agencyId, streamId, 'update',
    async (trx, freshContext) => await patchStreamDocumentTemplate(
      event, trx, freshContext.agencyId, streamId, templateId,
      attachmentIds => { replacedAttachmentIds = attachmentIds }
    )
  )
  const cleanupResults = await Promise.allSettled(replacedAttachmentIds.map(
    attachmentId => deleteStoredAttachmentById(db, attachmentId)
  ))
  cleanupResults.forEach((result, index) => {
    if (result.status === 'rejected') console.error('Failed to clean up replaced document-template attachment.', {
      attachmentId: replacedAttachmentIds[index], category: 'storage_cleanup_failed'
    })
  })
  return updated
})
