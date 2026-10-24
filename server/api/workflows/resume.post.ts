import { defineEventHandler } from 'h3'
import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { forbidden, notFound, throwApiError } from '~~/server/utils/api-errors'
import { resolveCompletionRuntimeEntityFromEntity, respondCompletionRuntimeEntityNotFound } from '~~/server/utils/completion-runtime'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { canManageEntityAssignments, canManageEntityAssignmentsWithContext } from '~~/server/utils/entity-assignment'
import {
  canAuthorizeWorkflowOwnerRecovery,
  executeFreshAuthorizedReviewRuntimeWrite,
  executeFreshAuthorizedWorkflowOwnerRecovery
} from '~~/server/utils/review-runtime-access'
import { readWorkflowRuntimeConfiguration, resumeWorkflowRun } from '~~/server/utils/workflow-runtime'
import { WorkflowResumeSchema } from '~~/shared/types/schemas/workflow'
import { isAssignableEntityType } from '~~/shared/utils/entity-assignments'
import {
  authorizeExtensionLifecycleRead,
  executeExtensionLifecycleWrite,
  resolveExtensionLifecycleRuntime
} from '~~/server/utils/extension-lifecycle-runtime'
import { canManageExtensionEntityAssignments } from '~~/server/utils/extension-entity-assignment'
import { requireQualifiedRuntimeLockEvidence } from '~~/server/utils/qualified-runtime-transaction'

// eslint-disable-next-line local/require-authorize -- ordinary work authority is required before fresh recovery authorization and actor/redirect checks
export default defineEventHandler(async event => {
  const body = await readValidatedBodyI18n(event, WorkflowResumeSchema)
  const extensionRuntime = body.entityType.includes(':')
    ? await resolveExtensionLifecycleRuntime(event, body.entityType, body.entityId)
    : null
  const context = extensionRuntime?.context
    ?? await resolveCompletionRuntimeEntityFromEntity(event.context.$db, body.entityType, body.entityId)
  if (!context) return await respondCompletionRuntimeEntityNotFound(event, body.entityType)
  if (extensionRuntime) await authorizeExtensionLifecycleRead(event, extensionRuntime)
  const actor = await resolveCurrentCommonUser(event)
  if (!actor) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
  if (!await canAuthorizeWorkflowOwnerRecovery(event, context, extensionRuntime)) return await forbidden(event)
  /**
   * Revalidates the paused run and resumes it inside the selected fresh-authorization transaction.
   * @param trx Locked fresh-authorization transaction.
   * @param administrative Whether independent assignment-management authority selected the transaction.
   * @returns Resumed workflow state or an API error response.
  */
  const resume = async (trx: Transaction<Database>, administrative: boolean) => {
    const run = await trx.selectFrom('Common_Runtime')
      .innerJoin('Common_Workflow_Run', 'Common_Workflow_Run.id', 'Common_Runtime.id')
      .selectAll('Common_Runtime')
      .select('Common_Workflow_Run.egcs_cn_completion')
      .where('Common_Runtime.id', '=', body.runtimeId)
      .where('Common_Runtime.egcs_cn_kind', '=', 'workflow')
      .where('Common_Runtime.egcs_cn_entitytype', '=', context.entityType)
      .where('Common_Runtime.egcs_cn_entityid', '=', context.entityId)
      .where('Common_Runtime.egcs_cn_purpose', '=', body.purpose)
      .where('Common_Runtime.egcs_cn_state', '=', 'paused')
      .where('Common_Runtime._deleted', '=', false)
      .forUpdate(['Common_Runtime', 'Common_Workflow_Run']).executeTakeFirst()
    if (!run) return await notFound(event, 'WORKFLOW_PAUSE_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (!administrative) {
      const configuration = await readWorkflowRuntimeConfiguration(trx, run)
      const blockers = await trx.selectFrom('Common_Workflow_Owner_Blocker').selectAll()
        .where('egcs_cn_workflowrun', '=', body.runtimeId).where('egcs_cn_resolvedat', 'is', null)
        .where('_deleted', '=', false).forUpdate().execute()
      const memberIds = new Set(blockers.map(blocker => String(blocker.egcs_cn_workflowsetupmember)))
      const redirectAllowed = [...memberIds].every(memberId => configuration.members.find(member => member.memberId === memberId)?.allowOwnerRedirect)
      const actorAllowed = String(run.egcs_cn_initiatedby) === actor.id
        || blockers.some(blocker => String(blocker.egcs_cn_triggeredby) === actor.id)
      if (!redirectAllowed || !actorAllowed) return await forbidden(event)
    }
    const resumed = await resumeWorkflowRun(trx, body.runtimeId, body.replacements, actor.id)
    return resumed
      ? {
          runtimeId: String(resumed.id),
          runtimeState: resumed.egcs_cn_state,
          attempt: Number(resumed.egcs_cn_attempt),
          previousRuntimeId: resumed.egcs_cn_previousruntime === null ? null : String(resumed.egcs_cn_previousruntime)
        }
      : await notFound(event, 'WORKFLOW_PAUSE_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  if (extensionRuntime) {
    const administrative = extensionRuntime.loaded.definition.assignmentMode === 'independent'
      ? await canManageExtensionEntityAssignments(event, extensionRuntime)
      : await canManageEntityAssignments(
          event,
          extensionRuntime.lockedEntity.owner.owner === 'agreement' ? 'fundingcaseagreement' : 'applicantrecipient',
          extensionRuntime.lockedEntity.owner.ownerId
        )
    return await executeExtensionLifecycleWrite(event, extensionRuntime, async (trx, current) => {
      if (current.lockedEntity.status.terminal) {
        return await throwApiError(event, {
          statusCode: 409,
          code: 'EXTENSION_LIFECYCLE_ENTITY_LOCKED',
          key: 'apiErrors.request.invalid_status'
        })
      }
      const evidence = requireQualifiedRuntimeLockEvidence(trx, current.context.entityType, current.context.entityId)
      const owner = current.lockedEntity.owner
      const freshAdministrative = administrative && (current.loaded.definition.assignmentMode === 'independent' && owner.owner === 'proponent'
        ? evidence.auth.userAbilities.canManageAssignments('applicant_recipient', { type: 'agency', agencyId: owner.agencyId })
        : await canManageEntityAssignmentsWithContext(
            evidence.auth, trx, owner.owner === 'agreement' ? 'fundingcaseagreement' : 'applicantrecipient', owner.ownerId
          ))
      return await resume(trx, freshAdministrative)
    })
  }
  if (isAssignableEntityType(context.entityType)
    && await canManageEntityAssignments(event, context.entityType, context.entityId)) {
    return await executeFreshAuthorizedWorkflowOwnerRecovery(event, context, async trx => await resume(trx, true))
  }
  return await executeFreshAuthorizedReviewRuntimeWrite(event, context, async trx => await resume(trx, false))
})
