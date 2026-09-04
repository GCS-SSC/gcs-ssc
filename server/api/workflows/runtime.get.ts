import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { authorizeReviewRuntimeAction, canAuthorizeReviewRuntimeAction } from '~~/server/utils/review-runtime-access'
import { resolveCompletionRuntimeEntityFromEntity, respondCompletionRuntimeEntityNotFound } from '~~/server/utils/completion-runtime'
import {
  getWorkflowRuntime,
  isWorkflowStartStatusAllowed,
  resolveActiveWorkflowSetup,
  resolvePublishedStandardWorkflowSetups,
  resolveWorkflowTargetStatus
} from '~~/server/utils/workflow-runtime'
import { WorkflowRuntimeQuerySchema } from '~~/shared/types/schemas/workflow'
import { canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { forbidden } from '~~/server/utils/api-errors'
import { resolveAssignedItemGrant } from '~~/server/utils/rbac'
import { canAccessEntityAssignmentOwner, canManageEntityAssignments, resolveEntityAssignmentOwner } from '~~/server/utils/entity-assignment'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { isAssignableEntityType } from '~~/shared/utils/entity-assignments'
import { resolveCompletionEvidenceId } from '~~/server/utils/completion-runtime-core'
import { resolveEntityTypeLifecycleDefinition } from '~~/server/utils/entity-type-registry'
import { authorizeExtensionLifecycleRead, resolveExtensionLifecycleRuntime } from '~~/server/utils/extension-lifecycle-runtime'
import { canManageExtensionEntityAssignments } from '~~/server/utils/extension-entity-assignment'
import { canAccessApplicantRecipient } from '~~/server/utils/applicant-recipient-auth'
import type { AssignableEntityType } from '~~/shared/types/database'
import { isBusinessStatusEntityType, resolveBusinessStatusProtection } from '~~/server/utils/business-status-runtime'

export default defineEventHandler(async event => {
  const query = await getValidatedQueryI18n(event, WorkflowRuntimeQuerySchema)
  const extensionRuntime = query.entityType?.includes(':')
    ? await resolveExtensionLifecycleRuntime(event, query.entityType, query.entityId)
    : null
  const context = extensionRuntime?.context
    ?? await resolveCompletionRuntimeEntityFromEntity(event.context.$db, query.entityType, query.entityId)
  if (!context) return await respondCompletionRuntimeEntityNotFound(event, query.entityType)
  const authContext = extensionRuntime
    ? await authorizeExtensionLifecycleRead(event, extensionRuntime)
    : await authorizeReviewRuntimeAction(event, 'read_assessment', context)
  if (context.agreementId) {
    const agreementContext = await resolveAgreementScopeContext(context.agreementId, event.context.$db)
    const hasViewerAccess = agreementContext
      ? await canAccessAgreement(authContext, 'read', agreementContext.scope, event.context.$db)
      : false
    if (!hasViewerAccess) return await forbidden(event)
  }
  const [setups, coreProtection, completionId, entityDefinition] = await Promise.all([
    query.purpose === 'standard'
      ? resolvePublishedStandardWorkflowSetups(event.context.$db, context)
      : resolveActiveWorkflowSetup(event.context.$db, context, query.purpose).then(item => item ? [item] : []),
    isBusinessStatusEntityType(context.entityType)
      ? resolveBusinessStatusProtection(event.context.$db, context.entityType, context.entityId)
      : null,
    resolveCompletionEvidenceId(event.context.$db, context.entityType, context.entityId),
    resolveEntityTypeLifecycleDefinition(event.context.$db, context.entityType)
  ])
  const targetStatus = extensionRuntime?.lockedEntity.status?.statusId
    ?? coreProtection?.statusId
    ?? await resolveWorkflowTargetStatus(event.context.$db, context.entityType, context.entityId)
  const targetTerminal = extensionRuntime?.lockedEntity.status?.terminal ?? coreProtection?.terminal ?? false
  const runtime = await getWorkflowRuntime(
    event.context.$db,
    query.entityType,
    query.entityId,
    query.runtimeId,
    query.purpose,
    context,
    { statusId: targetStatus, terminal: targetTerminal }
  )
  const setup = setups[0] ?? null
  const activeTargetRuntime = await event.context.$db.selectFrom('Common_Runtime')
    .select(['id', 'egcs_cn_purpose', 'egcs_cn_sourcepublication'])
    .where('egcs_cn_kind', '=', 'workflow')
    .where('egcs_cn_entitytype', '=', context.entityType)
    .where('egcs_cn_entityid', '=', context.entityId)
    .where('egcs_cn_state', 'in', ['pending', 'active', 'awaiting_action', 'paused'])
    .where('_deleted', '=', false)
    .executeTakeFirst()
  const hasActiveRuntime = Boolean(activeTargetRuntime)
  const activeSetup = activeTargetRuntime
    ? await event.context.$db.selectFrom('Common_Workflow_Setup')
        .select(['egcs_cn_name_en', 'egcs_cn_name_fr'])
        .where('id', '=', String(activeTargetRuntime.egcs_cn_sourcepublication))
        .executeTakeFirst()
    : null
  const purposeCanStart = query.purpose === 'standard'
    ? entityDefinition?.standardWorkflow === 'explicit'
    : ((query.purpose === 'approval_submission' && entityDefinition?.approvalSubmission === 'explicit')
      || (query.purpose === 'risk_rating' && entityDefinition?.riskRating === 'explicit'))
  const targetOpen = context.isOpen !== false
  const canStart = Boolean(purposeCanStart) && targetOpen && !targetTerminal && !hasActiveRuntime && Boolean(
    targetStatus
    && setups.some(candidate => isWorkflowStartStatusAllowed(candidate.egcs_cn_allowedstartstatuses, targetStatus))
  )
  const startBlocker = canStart
    ? null
    : activeTargetRuntime
      ? {
          reason: 'active_workflow' as const,
          runtimeId: String(activeTargetRuntime.id),
          purpose: activeTargetRuntime.egcs_cn_purpose,
          name_en: activeSetup?.egcs_cn_name_en,
          name_fr: activeSetup?.egcs_cn_name_fr
        }
      : !targetOpen
          ? { reason: 'closed_target' as const }
          : targetTerminal
            ? { reason: 'terminal_status' as const, statusId: targetStatus }
            : setups.length === 0
              ? { reason: 'no_published_workflow' as const }
              : targetStatus && !setups.some(candidate => isWorkflowStartStatusAllowed(candidate.egcs_cn_allowedstartstatuses, targetStatus))
                ? { reason: 'status_ineligible' as const, statusId: targetStatus }
                : { reason: 'unsupported' as const }
  const recommendations = await Promise.all((runtime.recommendations ?? []).map(async recommendation => {
    const grant = await resolveAssignedItemGrant(
      authContext.userId,
      'commonrecommendation',
      String(recommendation.id),
      event.context.$db
    )
    const owner = grant
      ? await resolveEntityAssignmentOwner(event.context.$db, 'commonrecommendation', String(recommendation.id))
      : null
    const hasUpdateRole = owner
      ? await canAccessEntityAssignmentOwner(authContext, owner, 'update', event.context.$db)
      : false
    return {
      ...recommendation,
      canUpdate: recommendation.runtimeState === 'active'
        && grant?.actions.has('update') === true
        && hasUpdateRole
    }
  }))
  let canResumeOwners = false
  const independentlyAssignable = isAssignableEntityType(context.entityType) || Boolean(extensionRuntime)
  if (runtime.current?.runtimeState === 'paused' && independentlyAssignable) {
    const actor = await resolveCurrentCommonUser(event)
    const blockers = (runtime.ownerBlockers ?? []).filter(blocker => !blocker.egcs_cn_resolvedat)
    const ordinaryActor = actor !== null && (runtime.current.initiatedBy === actor.id
      || blockers.some(blocker => String(blocker.egcs_cn_triggeredby) === actor.id))
    const canRedirect = blockers.length > 0 && blockers.every(blocker => (runtime.steps ?? [])
      .find(member => member.memberId === String(blocker.egcs_cn_workflowsetupmember))?.allowOwnerRedirect)
    const extensionCanWork = extensionRuntime
      ? await (async () => {
          const owner = extensionRuntime.lockedEntity.owner
          const hasUpdateRole = owner.owner === 'agreement'
            ? await (async () => {
                const agreement = await resolveAgreementScopeContext(owner.ownerId, event.context.$db)
                return agreement ? await canAccessAgreement(authContext, 'update', agreement.scope, event.context.$db) : false
              })()
            : await canAccessApplicantRecipient(authContext, owner.ownerId, 'update', event.context.$db)
          const assignmentTarget = extensionRuntime.loaded.definition.assignmentMode === 'independent'
            ? { entityType: context.entityType, entityId: context.entityId }
            : { entityType: owner.owner === 'agreement' ? 'fundingcaseagreement' as const : 'applicantrecipient' as const, entityId: owner.ownerId }
          return hasUpdateRole && Boolean(await resolveAssignedItemGrant(
            authContext.userId, assignmentTarget.entityType, assignmentTarget.entityId, event.context.$db
          ))
        })()
      : false
    const canWork = ordinaryActor && canRedirect && (extensionRuntime
      ? extensionCanWork
      : await canAuthorizeReviewRuntimeAction(event, 'save_assessment', context))
    canResumeOwners = canWork || (extensionRuntime
      ? extensionRuntime.loaded.definition.assignmentMode === 'independent'
        ? await canManageExtensionEntityAssignments(event, extensionRuntime)
        : await canManageEntityAssignments(
            event,
            extensionRuntime.lockedEntity.owner.owner === 'agreement' ? 'fundingcaseagreement' : 'applicantrecipient',
            extensionRuntime.lockedEntity.owner.ownerId
          )
      : await canManageEntityAssignments(event, context.entityType as AssignableEntityType, context.entityId))
  }
  return {
    ...runtime,
    canRetry: runtime.canRetry && !hasActiveRuntime && targetOpen,
    recommendations,
    canStart,
    startBlocker,
    activeWorkflowPurpose: activeTargetRuntime?.egcs_cn_purpose ?? null,
    canResumeOwners,
    applicable: { workflow: setup, completion: completionId ? setup : null }
  }
})
