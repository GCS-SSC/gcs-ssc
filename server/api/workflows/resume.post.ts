import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { forbidden, notFound } from '~~/server/utils/api-errors'
import { resolveCompletionRuntimeEntityFromEntity, respondCompletionRuntimeEntityNotFound } from '~~/server/utils/completion-runtime'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { canManageEntityAssignments } from '~~/server/utils/entity-assignment'
import {
  canAuthorizeReviewRuntimeAction,
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

// eslint-disable-next-line local/require-authorize -- authorization is selected below between the fresh casework and assignment-management transaction wrappers
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
    return await executeExtensionLifecycleWrite(event, extensionRuntime, async (trx) => await resume(trx, administrative))
  }
  if (isAssignableEntityType(context.entityType)
    && await canManageEntityAssignments(event, context.entityType, context.entityId)) {
    return await executeFreshAuthorizedWorkflowOwnerRecovery(event, context, async trx => await resume(trx, true))
  }
  if (!await canAuthorizeReviewRuntimeAction(event, 'save_assessment', context)) return await forbidden(event)
  return await executeFreshAuthorizedReviewRuntimeWrite(event, context, async trx => await resume(trx, false))
})
