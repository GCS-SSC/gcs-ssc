import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { retirePublication } from '~~/server/utils/system-publication'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { resolveWorkflowPublicationActorId } from '~~/server/utils/workflow-setup-versioning'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const workflowSetupId = getRouterParam(event, 'workflowSetupId')
  if (!profileId || !streamId || !workflowSetupId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const context = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', context.scope, db))
  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, context.agencyId, streamId, 'update', async (trx, _freshContext, authContext) => {
      const setup = await trx.selectFrom('Common_Workflow_Setup').select('id').where('id', '=', workflowSetupId)
        .where('egcs_cn_scopeid', '=', streamId).where('egcs_cn_scopetype', '=', 'transferpaymentstream')
        .where('_deleted', '=', false).forUpdate().executeTakeFirst()
      if (!setup) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
      const actorId = await resolveWorkflowPublicationActorId(trx, authContext.userId)
      if (!actorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
      return await retirePublication(trx, { publicationId: workflowSetupId, kind: 'workflow_setup', actorId })
    }
  )
})
