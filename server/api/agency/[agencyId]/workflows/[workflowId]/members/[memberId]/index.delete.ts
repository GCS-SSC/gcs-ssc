import { authorize } from '~~/server/utils/authorize'
import { authorizeAgencyWorkflowSetup } from '~~/server/utils/agency-workflow-authorization'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { lockWorkflowSetupForMutation } from '~~/server/utils/workflow-setup-versioning'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  const workflowSetupId = getRouterParam(event, 'workflowId')
  const memberId = getRouterParam(event, 'memberId')
  if (!agencyId || !workflowSetupId || !memberId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  await authorizeAgencyWorkflowSetup(event, 'update', agencyId, workflowSetupId)
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const setup = await lockWorkflowSetupForMutation(trx, workflowSetupId, agencyId)
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
      await trx.updateTable('Common_Workflow_Setup_Member').set(eb => ({ egcs_cn_sequence: eb('egcs_cn_sequence', '+', 100000) }))
        .where('id', 'in', remaining.map(member => String(member.id))).execute()
      for (const [index, member] of remaining.entries()) {
        await trx.updateTable('Common_Workflow_Setup_Member').set({ egcs_cn_sequence: index + 1 })
          .where('id', '=', String(member.id)).execute()
      }
    }
    return deleted
  })
})
