import { authorize } from '~~/server/utils/authorize'
import { areAgencyWorkflowStatusesValid, authorizeAgencyWorkflowCatalog } from '~~/server/utils/agency-workflow-authorization'
import { CommonWorkflowSetupCreateSchema } from '~~/shared/types/schemas'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { supportsWorkflowConfiguration } from '~~/server/utils/entity-type-registry'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  if (!agencyId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  await authorizeAgencyWorkflowCatalog(event, 'update', agencyId)
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  const body = await readValidatedBodyI18n(event, CommonWorkflowSetupCreateSchema)
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    if (!await supportsWorkflowConfiguration(trx, body.egcs_cn_entitytype, body.egcs_cn_purpose)) {
      return await badRequest(event, 'WORKFLOW_TARGET_TYPE_INVALID', 'apiErrors.request.invalid')
    }
    if (!await areAgencyWorkflowStatusesValid(trx, agencyId, [
      ...body.egcs_cn_allowedstartstatuses,
      body.egcs_cn_cancellationstatus,
      body.egcs_cn_executionfailurestatus
    ])) {
      return await badRequest(event, 'WORKFLOW_STATUSES_INVALID', 'apiErrors.request.invalid_resource')
    }
    const { egcs_cn_allowedstartstatuses: allowedStartStatuses, ...values } = body
    const setup = await trx.insertInto('Common_Workflow_Setup').values({
      ...values,
      egcs_cn_agency: agencyId,
      _deleted: false
    }).returningAll().executeTakeFirstOrThrow()
    await trx.insertInto('Common_Workflow_Setup_Allowed_Start_Status').values(
      allowedStartStatuses.map((statusId, index) => ({
        egcs_cn_workflowsetup: String(setup.id),
        egcs_cn_status: statusId,
        egcs_cn_order: index + 1,
        _deleted: false
      }))
    ).execute()
    return {
      ...setup,
      egcs_cn_allowedstartstatuses: allowedStartStatuses,
      publicationId: String(setup.id),
      publicationState: 'draft' as const,
      publicationVersionId: null,
      publicationVersion: null,
      hasUnpublishedChanges: true
    }
  }
  )
})
