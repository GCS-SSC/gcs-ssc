import { CommonWorkflowSetupMemberOwnersSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { replaceWorkflowSetupMemberOwners } from '~~/server/utils/workflow-setup-members'
import { lockWorkflowSetupForMutation } from '~~/server/utils/workflow-setup-versioning'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const workflowSetupId = getRouterParam(event, 'workflowSetupId')
  const memberId = getRouterParam(event, 'memberId')
  if (!profileId || !streamId || !workflowSetupId || !memberId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const context = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', context.scope, db))
  const owners = await readValidatedBodyI18n(event, CommonWorkflowSetupMemberOwnersSchema)
  return await executeFreshAuthorizedTransferPaymentStreamWrite(event, db, profileId, context.agencyId, streamId, 'update', async trx => {
    const setup = await lockWorkflowSetupForMutation(trx, workflowSetupId, streamId)
    if (!setup) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (setup.publicationState === 'retired') {
      return await throwApiError(event, {
        statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
      })
    }
    const member = await trx.selectFrom('Common_Workflow_Setup_Member')
      .innerJoin('Common_Workflow_Setup', 'Common_Workflow_Setup.id', 'Common_Workflow_Setup_Member.egcs_cn_workflowsetup')
      .selectAll('Common_Workflow_Setup_Member')
      .where('Common_Workflow_Setup_Member.id', '=', memberId)
      .where('Common_Workflow_Setup_Member.egcs_cn_workflowsetup', '=', workflowSetupId)
      .where('Common_Workflow_Setup.egcs_cn_scopeid', '=', streamId)
      .where('Common_Workflow_Setup._deleted', '=', false).where('Common_Workflow_Setup_Member._deleted', '=', false)
      .forUpdate('Common_Workflow_Setup_Member').executeTakeFirst()
    if (!member) return await notFound(event, 'WORKFLOW_MEMBER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (!await replaceWorkflowSetupMemberOwners(trx, member, owners)) {
      return await badRequest(event, 'WORKFLOW_MEMBER_OWNERS_INVALID', 'apiErrors.request.invalid_resource')
    }
    return owners
  })
})
