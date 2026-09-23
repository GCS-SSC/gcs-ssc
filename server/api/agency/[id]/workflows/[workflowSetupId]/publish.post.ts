import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { authorizeAgencyWorkflowSetup } from '~~/server/utils/agency-workflow-authorization'
import { isExpectedPublicationFailure } from '~~/server/utils/publication-errors'
import { publishDefinition } from '~~/server/utils/system-publication'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { buildWorkflowSetupPublication, resolveWorkflowPublicationActorId } from '~~/server/utils/workflow-setup-versioning'
import { validateWorkflowRiskRatingMappingForStream } from '~~/server/utils/agreement-risk-rating'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id')
  const workflowSetupId = getRouterParam(event, 'workflowSetupId')
  if (!agencyId || !workflowSetupId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  await authorizeAgencyWorkflowSetup(event, 'update', agencyId, workflowSetupId)
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const setup = await trx.selectFrom('Common_Workflow_Setup').selectAll().where('id', '=', workflowSetupId)
      .where('egcs_cn_agency', '=', agencyId)
      .where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!setup) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const actorId = await resolveWorkflowPublicationActorId(trx, (await requireAuthContext(event)).userId)
    if (!actorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    let plan
    try {
      plan = await buildWorkflowSetupPublication(trx, setup)
    } catch (error: unknown) {
      if (!isExpectedPublicationFailure(error)) throw error
      return await badRequest(event, 'WORKFLOW_SETUP_INVALID_PUBLICATION', 'apiErrors.request.invalid_resource')
    }
    if (plan.definition.purpose === 'risk_rating') {
      const links = await trx.selectFrom('Transfer_Payment_Stream_Workflow')
        .select('egcs_tp_transferpaymentstream')
        .where('egcs_tp_workflow', '=', workflowSetupId)
        .where('_deleted', '=', false)
        .forUpdate()
        .execute()
      for (const link of links) {
        if (!await validateWorkflowRiskRatingMappingForStream(trx, String(link.egcs_tp_transferpaymentstream), plan.definition)) {
          return await badRequest(event, 'WORKFLOW_RISK_RATING_MAPPING_INVALID', 'apiErrors.request.invalid_resource')
        }
      }
    }
    const published = await publishDefinition(trx, {
      publicationId: workflowSetupId,
      kind: 'workflow_setup',
      definition: plan.definition,
      actorId,
      references: plan.references,
      workflowStatuses: plan.statuses
    })
    const { definition: _definition, hash: _hash, ...metadata } = published
    return { ...setup, id: String(setup.id), egcs_cn_agency: String(setup.egcs_cn_agency), ...metadata }
  }
  )
})
