import { sql } from 'kysely'
import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { lockWorkflowSetupForMutation } from '~~/server/utils/workflow-setup-versioning'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const workflowSetupId = getRouterParam(event, 'workflowSetupId')
  const memberId = getRouterParam(event, 'memberId')
  if (!profileId || !streamId || !workflowSetupId || !memberId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const context = await authorizeTransferPaymentStreamResource(event, 'delete', profileId, streamId)
  if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'delete', createTransferPaymentScopedAuthorizeHandler('delete', context.scope, db))
  return await executeFreshAuthorizedTransferPaymentStreamWrite(event, db, profileId, context.agencyId, streamId, 'delete', async trx => {
    const setup = await lockWorkflowSetupForMutation(trx, workflowSetupId, streamId)
    if (!setup) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (setup.publicationState === 'retired') {
      return await throwApiError(event, {
        statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
      })
    }
    const deleted = await trx.updateTable('Common_Workflow_Setup_Member').set({ _deleted: true })
      .where('id', '=', memberId).where('egcs_cn_workflowsetup', '=', workflowSetupId).where('_deleted', '=', false)
      .returningAll().executeTakeFirst()
    if (!deleted) return await notFound(event, 'WORKFLOW_MEMBER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    await trx.updateTable('Common_Workflow_Setup_Member_Owner').set({ _deleted: true })
      .where('egcs_cn_workflowsetupmember', '=', memberId).where('_deleted', '=', false).execute()
    const remaining = await trx.selectFrom('Common_Workflow_Setup_Member').selectAll()
      .where('egcs_cn_workflowsetup', '=', workflowSetupId).where('_deleted', '=', false)
      .orderBy('egcs_cn_sequence', 'asc').forUpdate().execute()
    if (remaining.length > 0) {
      await trx.updateTable('Common_Workflow_Setup_Member').set({ egcs_cn_sequence: sql<number>`egcs_cn_sequence + 100000` })
        .where('id', 'in', remaining.map(member => String(member.id))).execute()
      for (const [index, member] of remaining.entries()) {
        await trx.updateTable('Common_Workflow_Setup_Member').set({ egcs_cn_sequence: index + 1 })
          .where('id', '=', String(member.id)).execute()
      }
    }
    return deleted
  })
})
