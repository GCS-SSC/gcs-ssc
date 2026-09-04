import { forbidden, notFound } from '~~/server/utils/api-errors'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { listAgencyScopedCommonUsers, resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { resolveCompletionRuntimeEntityFromEntity, respondCompletionRuntimeEntityNotFound } from '~~/server/utils/completion-runtime'
import {
  canManageEntityAssignments,
  resolveAgencyValidEntityAssigneeIdsWithDb,
  resolveEntityAssignmentOwner
} from '~~/server/utils/entity-assignment'
import { canAuthorizeReviewRuntimeAction } from '~~/server/utils/review-runtime-access'
import { readWorkflowRuntimeConfiguration } from '~~/server/utils/workflow-runtime'
import { WorkflowOwnerCandidatesQuerySchema } from '~~/shared/types/schemas/workflow'
import { isAssignableEntityType } from '~~/shared/utils/entity-assignments'
import { authorizeExtensionLifecycleRead, resolveExtensionLifecycleRuntime } from '~~/server/utils/extension-lifecycle-runtime'
import {
  canManageExtensionEntityAssignments,
  resolveExtensionEntityAssignmentOwner
} from '~~/server/utils/extension-entity-assignment'
import { resolveExtensionEligibleAssigneeIds } from '~~/server/utils/extension-lifecycle-context'
import type { AssignableEntityType } from '~~/shared/types/database'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

// eslint-disable-next-line local/require-authorize -- delegates to exact casework or independent assignment-management authorization below
export default defineEventHandler(async event => {
  const query = await getValidatedQueryI18n(event, WorkflowOwnerCandidatesQuerySchema)
  const extensionRuntime = query.entityType?.includes(':')
    ? await resolveExtensionLifecycleRuntime(event, query.entityType, query.entityId)
    : null
  const context = extensionRuntime?.context
    ?? await resolveCompletionRuntimeEntityFromEntity(event.context.$db, query.entityType, query.entityId)
  if (!context) return await respondCompletionRuntimeEntityNotFound(event, query.entityType)
  if (extensionRuntime) await authorizeExtensionLifecycleRead(event, extensionRuntime)
  else if (!isAssignableEntityType(context.entityType)) return await forbidden(event)
  const actor = await resolveCurrentCommonUser(event)
  if (!actor) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
  if (!isPositivePostgresBigintText(query.runtimeId)) {
    return await notFound(event, 'WORKFLOW_PAUSE_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  const run = await event.context.$db.selectFrom('Common_Runtime')
    .innerJoin('Common_Workflow_Run', 'Common_Workflow_Run.id', 'Common_Runtime.id')
    .selectAll('Common_Runtime')
    .select('Common_Workflow_Run.egcs_cn_completion')
    .where('Common_Runtime.id', '=', query.runtimeId)
    .where('Common_Runtime.egcs_cn_kind', '=', 'workflow')
    .where('Common_Runtime.egcs_cn_entitytype', '=', context.entityType)
    .where('Common_Runtime.egcs_cn_entityid', '=', context.entityId)
    .where('Common_Runtime.egcs_cn_purpose', '=', query.purpose)
    .where('Common_Runtime.egcs_cn_state', '=', 'paused')
    .where('Common_Runtime._deleted', '=', false).executeTakeFirst()
  if (!run) return await notFound(event, 'WORKFLOW_PAUSE_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const blockers = await event.context.$db.selectFrom('Common_Workflow_Owner_Blocker').selectAll()
    .where('egcs_cn_workflowrun', '=', query.runtimeId).where('egcs_cn_resolvedat', 'is', null)
    .where('_deleted', '=', false).execute()
  const configuration = await readWorkflowRuntimeConfiguration(event.context.$db, run)
  const ordinaryActor = String(run.egcs_cn_initiatedby) === actor.id
    || blockers.some(blocker => String(blocker.egcs_cn_triggeredby) === actor.id)
  const canRedirect = blockers.every(blocker => configuration.members
    .find(member => member.memberId === String(blocker.egcs_cn_workflowsetupmember))?.allowOwnerRedirect)
  const canWork = ordinaryActor && canRedirect && (extensionRuntime
    ? true
    : await canAuthorizeReviewRuntimeAction(event, 'save_assessment', context))
  const canManage = extensionRuntime
    ? extensionRuntime.loaded.definition.assignmentMode === 'independent'
      ? await canManageExtensionEntityAssignments(event, extensionRuntime)
      : await canManageEntityAssignments(
          event,
          extensionRuntime.lockedEntity.owner.owner === 'agreement' ? 'fundingcaseagreement' : 'applicantrecipient',
          extensionRuntime.lockedEntity.owner.ownerId
        )
    : await canManageEntityAssignments(event, context.entityType as AssignableEntityType, context.entityId)
  if (!canWork && !canManage) return await forbidden(event)
  const owner = extensionRuntime
    ? resolveExtensionEntityAssignmentOwner(extensionRuntime)
    : await resolveEntityAssignmentOwner(event.context.$db, context.entityType as AssignableEntityType, context.entityId)
  if (!owner) return await notFound(event, 'ASSIGNMENT_TARGET_NOT_FOUND', 'apiErrors.request.not_found')
  const users = await listAgencyScopedCommonUsers(event.context.$db, owner.agencyId)
  const eligibleIds = extensionRuntime
    ? await resolveExtensionEligibleAssigneeIds(event.context.$db, extensionRuntime, users.map(user => user.id))
    : await resolveAgencyValidEntityAssigneeIdsWithDb(
        event.context.$db, context.entityType as AssignableEntityType, context.entityId, users.map(user => user.id)
      )
  const items = users.filter(user => eligibleIds.has(user.id)).map(user => ({
    id: user.id, egcs_cn_name_en: user.name, egcs_cn_name_fr: user.name
  }))
  return { items, total: items.length, page: 1, limit: items.length }
})
