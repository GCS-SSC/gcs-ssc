import { defineEventHandler, getRouterParam } from 'h3'
import { authorize } from '~~/server/utils/authorize'
import { authorizeAgencyWorkflowSetup } from '~~/server/utils/agency-workflow-authorization'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { InvalidPersistedAssessmentDefinitionError } from '~~/server/utils/assessment-runtime-schema'
import { throwApiError } from '~~/server/utils/api-errors'
import { isExpectedPublicationFailure } from '~~/server/utils/publication-errors'
import { readWorkflowResultSources } from '~~/server/utils/workflow-result-sources'
import { buildWorkflowSetupPublication } from '~~/server/utils/workflow-setup-versioning'
import { simulateWorkflow } from '~~/server/utils/workflow-simulation'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { WorkflowSimulationSchema } from '~~/shared/types/schemas/workflow-simulation'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  const workflowSetupId = getRouterParam(event, 'workflowId')
  if (!agencyId || !workflowSetupId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(workflowSetupId)) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.request.not_found')
  await authorizeAgencyWorkflowSetup(event, 'read', agencyId, workflowSetupId)
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  const scenario = await readValidatedBodyI18n(event, WorkflowSimulationSchema)
  const db = event.context.$db
  const setup = await db.selectFrom('Common_Workflow_Setup').selectAll().where('id', '=', workflowSetupId)
    .where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
  if (!setup) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')

  try {
    const plan = await buildWorkflowSetupPublication(db, setup)
    const sources = await Promise.all(plan.definition.members.map(async member =>
      [member.memberId, await readWorkflowResultSources(db, member, 'simulation')] as const))
    const statuses = await db.selectFrom('Common_Status').select(['id', 'egcs_cn_terminal'])
      .where('egcs_cn_agency', '=', agencyId)
      .where('id', 'in', [...new Set(plan.statuses.map(status => status.statusId))]).where('_deleted', '=', false).execute()
    return simulateWorkflow(plan.definition, new Map(sources),
      new Map(statuses.map(status => [String(status.id), { id: String(status.id), terminal: status.egcs_cn_terminal }])), scenario)
  } catch (error) {
    if (error instanceof InvalidPersistedAssessmentDefinitionError) return await throwApiError(event, {
      statusCode: 500, code: 'ASSESSMENT_DEFINITION_INVALID', key: 'apiErrors.assessment.definition_invalid'
    })
    if (!isExpectedPublicationFailure(error)) throw error
    return await badRequest(event, 'WORKFLOW_SETUP_INVALID_PUBLICATION', 'apiErrors.request.invalid_resource')
  }
})
