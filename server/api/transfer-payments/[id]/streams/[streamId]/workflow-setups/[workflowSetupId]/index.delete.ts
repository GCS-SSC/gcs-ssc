import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { lockWorkflowSetupForMutation } from '~~/server/utils/workflow-setup-versioning'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const workflowSetupId = getRouterParam(event, 'workflowSetupId')
  if (!profileId || !streamId || !workflowSetupId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const streamContext = await authorizeTransferPaymentStreamResource(event, 'delete', profileId, streamId)
  if (!streamContext) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'delete', createTransferPaymentScopedAuthorizeHandler('delete', streamContext.scope, db))
  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'delete', async trx => {
      const current = await lockWorkflowSetupForMutation(trx, workflowSetupId, streamId)
      if (!current) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
      if (current.publicationState !== 'draft') {
        return await badRequest(event, 'WORKFLOW_SETUP_NOT_DRAFT', 'apiErrors.request.invalid_status')
      }
      const item = await trx.updateTable('Common_Workflow_Setup').set({ _deleted: true })
        .where('id', '=', workflowSetupId).where('egcs_cn_scopetype', '=', 'transferpaymentstream')
        .where('egcs_cn_scopeid', '=', streamId).where('_deleted', '=', false).returningAll().executeTakeFirst()
      if (!item) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
      await trx.updateTable('Common_Publication').set({ _deleted: true }).where('id', '=', workflowSetupId)
        .where('egcs_cn_state', '=', 'draft').where('_deleted', '=', false).execute()
      return item
    }
  )
})
