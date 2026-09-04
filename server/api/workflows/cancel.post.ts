import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeReviewRuntimeAction, executeFreshAuthorizedReviewRuntimeWrite } from '~~/server/utils/review-runtime-access'
import { resolveCompletionRuntimeEntityFromEntity, respondCompletionRuntimeEntityNotFound } from '~~/server/utils/completion-runtime'
import { WorkflowCancelSchema } from '~~/shared/types/schemas/workflow'
import { cancelWorkflowRun } from '~~/server/utils/workflow-runtime'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { throwApiError } from '~~/server/utils/api-errors'
import {
  authorizeExtensionLifecycleRead,
  executeExtensionLifecycleWrite,
  resolveExtensionLifecycleRuntime
} from '~~/server/utils/extension-lifecycle-runtime'

export default defineEventHandler(async event => {
  const body = await readValidatedBodyI18n(event, WorkflowCancelSchema)
  const extensionRuntime = body.entityType.includes(':')
    ? await resolveExtensionLifecycleRuntime(event, body.entityType, body.entityId)
    : null
  const context = extensionRuntime?.context
    ?? await resolveCompletionRuntimeEntityFromEntity(event.context.$db, body.entityType, body.entityId)
  if (!context) return await respondCompletionRuntimeEntityNotFound(event, body.entityType)
  if (extensionRuntime) await authorizeExtensionLifecycleRead(event, extensionRuntime)
  else await authorizeReviewRuntimeAction(event, 'save_assessment', context)
  /** Cancels the active Workflow in the caller's already-authorized transaction.
   * @param trx - Open host transaction.
   * @param currentContext - Freshly resolved target context.
   * @param actorUserId - Common user cancelling the Workflow.
   * @returns The cancelled Workflow projection.
   */
  const cancelCurrent = async (trx: Parameters<typeof cancelWorkflowRun>[0], currentContext: typeof context, actorUserId: string) => {
    const run = await trx.selectFrom('Common_Runtime')
      .innerJoin('Common_Workflow_Run', 'Common_Workflow_Run.id', 'Common_Runtime.id')
      .selectAll('Common_Runtime')
      .select('Common_Workflow_Run.egcs_cn_completion')
      .where('Common_Runtime.egcs_cn_kind', '=', 'workflow')
      .where('Common_Runtime.id', '=', body.runtimeId)
      .where('Common_Runtime.egcs_cn_entitytype', '=', currentContext.entityType)
      .where('Common_Runtime.egcs_cn_entityid', '=', currentContext.entityId)
      .where('Common_Runtime.egcs_cn_purpose', '=', body.purpose)
      .where('Common_Runtime.egcs_cn_state', 'in', ['pending', 'active', 'awaiting_action', 'paused'])
      .where('Common_Runtime._deleted', '=', false)
      .forUpdate(['Common_Runtime', 'Common_Workflow_Run']).executeTakeFirst()
    if (!run) {
      return await throwApiError(event, {
        statusCode: 409,
        code: 'WORKFLOW_CANCEL_STALE',
        key: 'apiErrors.request.invalid_status'
      })
    }
    const cancelled = await cancelWorkflowRun(trx, run, actorUserId)
    if (cancelled && body.purpose === 'approval_submission') {
      if (currentContext.entityType === 'fundingcaseagreementcloseout') {
        await trx.updateTable('Funding_Case_Agreement_Closeout')
          .set({ egcs_fc_isopen: false })
          .where('id', '=', currentContext.entityId)
          .where('_deleted', '=', false)
          .executeTakeFirstOrThrow()
      } else if (currentContext.entityType === 'fundingcaseamendment') {
        await trx.updateTable('Funding_Case_Agreement_Amendment')
          .set({ egcs_fc_isopen: false })
          .where('id', '=', currentContext.entityId)
          .where('_deleted', '=', false)
          .executeTakeFirstOrThrow()
      } else if (currentContext.entityType === 'fundingclaimreconcile') {
        await trx.updateTable('Funding_Case_Agreement_Claim_Reconcile')
          .set({ egcs_fc_isopen: false, egcs_fc_isfinal: false })
          .where('id', '=', currentContext.entityId)
          .where('egcs_fc_isopen', '=', true)
          .where('_deleted', '=', false)
          .executeTakeFirstOrThrow()
      }
    }
    return cancelled && {
      runtimeId: String(cancelled.id),
      runtimeState: cancelled.egcs_cn_state,
      attempt: Number(cancelled.egcs_cn_attempt),
      previousRuntimeId: cancelled.egcs_cn_previousruntime === null ? null : String(cancelled.egcs_cn_previousruntime)
    }
  }
  return extensionRuntime
    ? await executeExtensionLifecycleWrite(event, extensionRuntime, async (trx, current, actorUserId) =>
        await cancelCurrent(trx, current.context, actorUserId))
    : await executeFreshAuthorizedReviewRuntimeWrite(event, context, async (trx, currentContext) => {
        const actor = await resolveCurrentCommonUser(event, trx)
        if (!actor) return await unauthorized(event)
        return await cancelCurrent(trx, currentContext, actor.id)
      })
})
