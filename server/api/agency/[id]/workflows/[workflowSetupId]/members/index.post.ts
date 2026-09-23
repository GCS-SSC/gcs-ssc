import { authorize } from '~~/server/utils/authorize'
import { areAgencyWorkflowStatusesValid, authorizeAgencyWorkflowSetup } from '~~/server/utils/agency-workflow-authorization'
import { replaceWorkflowConditions } from '~~/server/utils/workflow-conditions'
import { CommonWorkflowSetupMemberCreateSchema } from '~~/shared/types/schemas'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { isValidWorkflowSetupMemberReference, replaceWorkflowSetupMemberOwners } from '~~/server/utils/workflow-setup-members'
import { lockWorkflowSetupForMutation } from '~~/server/utils/workflow-setup-versioning'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id')
  const workflowSetupId = getRouterParam(event, 'workflowSetupId')
  if (!agencyId || !workflowSetupId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(workflowSetupId)) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
  await authorizeAgencyWorkflowSetup(event, 'update', agencyId, workflowSetupId)
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  const body = await readValidatedBodyI18n(event, CommonWorkflowSetupMemberCreateSchema)
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const setup = await lockWorkflowSetupForMutation(trx, workflowSetupId, agencyId)
    if (!setup) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (setup.publicationState === 'retired') {
      return await throwApiError(event, {
        statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
      })
    }
    const { owners = [], conditions = [], ...memberValues } = body
    if (!await areAgencyWorkflowStatusesValid(trx, agencyId, [
      memberValues.egcs_cn_materializationstatus,
      memberValues.egcs_cn_successstatus,
      memberValues.egcs_cn_failurestatus
    ])) {
      return await badRequest(event, 'WORKFLOW_STATUSES_INVALID', 'apiErrors.request.invalid_resource')
    }
    if (!await isValidWorkflowSetupMemberReference(trx, setup, memberValues)) {
      return await badRequest(event, 'WORKFLOW_MEMBER_REFERENCE_INVALID', 'apiErrors.request.invalid_resource')
    }
    const existing = await trx.selectFrom('Common_Workflow_Setup_Member').selectAll()
      .where('egcs_cn_workflowsetup', '=', workflowSetupId).where('_deleted', '=', false)
      .orderBy('egcs_cn_sequence', 'asc').forUpdate().execute()
    const sequence = Math.min(body.egcs_cn_sequence, existing.length + 1)
    if (existing.length > 0) {
      await trx.updateTable('Common_Workflow_Setup_Member')
        .set(eb => ({ egcs_cn_sequence: eb('egcs_cn_sequence', '+', 100000) }))
        .where('id', 'in', existing.map(member => String(member.id))).execute()
    }
    const created = await trx.insertInto('Common_Workflow_Setup_Member').values({
      ...memberValues, egcs_cn_workflowsetup: workflowSetupId, egcs_cn_sequence: sequence, _deleted: false
    }).returningAll().executeTakeFirstOrThrow()
    if (!await replaceWorkflowSetupMemberOwners(trx, created, owners)) {
      return await badRequest(event, 'WORKFLOW_MEMBER_OWNERS_INVALID', 'apiErrors.request.invalid_resource')
    }
    for (const [index, member] of existing.entries()) {
      const nextSequence = index + 1 >= sequence ? index + 2 : index + 1
      await trx.updateTable('Common_Workflow_Setup_Member').set({ egcs_cn_sequence: nextSequence })
        .where('id', '=', String(member.id)).execute()
    }
    if (conditions && !await replaceWorkflowConditions(trx, agencyId, String(created.id), conditions)) {
      return await badRequest(event, 'WORKFLOW_CONDITIONS_INVALID', 'apiErrors.request.invalid_resource')
    }
    return created
  })
})
