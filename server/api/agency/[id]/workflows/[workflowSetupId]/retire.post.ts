import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { authorizeAgencyWorkflowSetup } from '~~/server/utils/agency-workflow-authorization'
import { retirePublication } from '~~/server/utils/system-publication'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { resolveWorkflowPublicationActorId } from '~~/server/utils/workflow-setup-versioning'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id')
  const workflowSetupId = getRouterParam(event, 'workflowSetupId')
  if (!agencyId || !workflowSetupId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  await authorizeAgencyWorkflowSetup(event, 'update', agencyId, workflowSetupId)
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const setup = await trx.selectFrom('Common_Workflow_Setup').select('id').where('id', '=', workflowSetupId)
      .where('egcs_cn_agency', '=', agencyId)
      .where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!setup) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const actorId = await resolveWorkflowPublicationActorId(trx, (await requireAuthContext(event)).userId)
    if (!actorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    return await retirePublication(trx, { publicationId: workflowSetupId, kind: 'workflow_setup', actorId })
  }
  )
})
