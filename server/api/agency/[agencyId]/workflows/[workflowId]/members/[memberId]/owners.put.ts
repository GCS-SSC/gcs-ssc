import { authorize } from '~~/server/utils/authorize'
import { authorizeAgencyWorkflowSetup } from '~~/server/utils/agency-workflow-authorization'
import { CommonWorkflowSetupMemberOwnersSchema } from '~~/shared/types/schemas'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { replaceWorkflowSetupMemberOwners } from '~~/server/utils/workflow-setup-members'
import { lockWorkflowSetupForMutation } from '~~/server/utils/workflow-setup-versioning'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  const workflowSetupId = getRouterParam(event, 'workflowId')
  const memberId = getRouterParam(event, 'memberId')
  if (!agencyId || !workflowSetupId || !memberId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  await authorizeAgencyWorkflowSetup(event, 'update', agencyId, workflowSetupId)
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  const owners = await readValidatedBodyI18n(event, CommonWorkflowSetupMemberOwnersSchema)
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const setup = await lockWorkflowSetupForMutation(trx, workflowSetupId, agencyId)
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
      .where('Common_Workflow_Setup.egcs_cn_agency', '=', agencyId)
      .where('Common_Workflow_Setup._deleted', '=', false).where('Common_Workflow_Setup_Member._deleted', '=', false)
      .forUpdate('Common_Workflow_Setup_Member').executeTakeFirst()
    if (!member) return await notFound(event, 'WORKFLOW_MEMBER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (!await replaceWorkflowSetupMemberOwners(trx, member, owners)) {
      return await badRequest(event, 'WORKFLOW_MEMBER_OWNERS_INVALID', 'apiErrors.request.invalid_resource')
    }
    return owners
  })
})
