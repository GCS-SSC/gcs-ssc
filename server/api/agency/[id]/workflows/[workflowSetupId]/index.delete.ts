import { authorize } from '~~/server/utils/authorize'
import { authorizeAgencyWorkflowSetup } from '~~/server/utils/agency-workflow-authorization'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { lockWorkflowSetupForMutation } from '~~/server/utils/workflow-setup-versioning'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id')
  const workflowSetupId = getRouterParam(event, 'workflowSetupId')
  if (!agencyId || !workflowSetupId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  await authorizeAgencyWorkflowSetup(event, 'update', agencyId, workflowSetupId)
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const current = await lockWorkflowSetupForMutation(trx, workflowSetupId, agencyId)
    if (!current) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (current.publicationState !== 'draft') {
      return await badRequest(event, 'WORKFLOW_SETUP_NOT_DRAFT', 'apiErrors.request.invalid_status')
    }
    const item = await trx.updateTable('Common_Workflow_Setup').set({ _deleted: true })
      .where('id', '=', workflowSetupId)
      .where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false).returningAll().executeTakeFirst()
    if (!item) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
    await trx.updateTable('Common_Publication').set({ _deleted: true }).where('id', '=', workflowSetupId)
      .where('egcs_cn_state', '=', 'draft').where('_deleted', '=', false).execute()
    return item
  }
  )
})
