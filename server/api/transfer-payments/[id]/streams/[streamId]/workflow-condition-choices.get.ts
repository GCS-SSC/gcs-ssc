import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { readWorkflowProfileChoices } from '~~/server/utils/workflow-profile-conditions'

export default defineEventHandler(async event => {
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  return await executeFreshReadSnapshot(event, async db => {
    const context = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
    if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
    await authorize(event, 'transfer_payment', 'read', createTransferPaymentScopedAuthorizeHandler('read', context.scope, db))
    return await readWorkflowProfileChoices(db, streamId)
  })
})
