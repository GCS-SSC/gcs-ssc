import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeReviewRuntimeAction, executeFreshAuthorizedReviewRuntimeWrite } from '~~/server/utils/review-runtime-access'
import { resolveCompletionRuntimeEntityFromEntity, respondCompletionRuntimeEntityNotFound } from '~~/server/utils/completion-runtime'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { resolveRetryableWorkflowSetup, startWorkflow } from '~~/server/utils/workflow-runtime'
import { WorkflowRetrySchema } from '~~/shared/types/schemas/workflow'
import { throwApiError } from '~~/server/utils/api-errors'
import {
  authorizeExtensionLifecycleRead,
  executeExtensionLifecycleWrite,
  resolveExtensionLifecycleRuntime
} from '~~/server/utils/extension-lifecycle-runtime'

export default defineEventHandler(async event => {
  const body = await readValidatedBodyI18n(event, WorkflowRetrySchema)
  const extensionRuntime = body.entityType.includes(':')
    ? await resolveExtensionLifecycleRuntime(event, body.entityType, body.entityId)
    : null
  const context = extensionRuntime?.context
    ?? await resolveCompletionRuntimeEntityFromEntity(event.context.$db, body.entityType, body.entityId)
  if (!context) return await respondCompletionRuntimeEntityNotFound(event, body.entityType)
  if (extensionRuntime) await authorizeExtensionLifecycleRead(event, extensionRuntime)
  else await authorizeReviewRuntimeAction(event, 'save_assessment', context)
  /** Retries the pinned Workflow in the caller's already-authorized transaction.
   * @param trx - Open host transaction.
   * @param currentContext - Freshly resolved target context.
   * @param actorUserId - Common user initiating the retry.
   * @returns The successor Workflow run, or null when retry is unavailable.
   */
  const retryCurrent = async (trx: Parameters<typeof startWorkflow>[1], currentContext: typeof context, actorUserId: string) => {
    if (currentContext.isOpen === false) {
      return await throwApiError(event, {
        statusCode: 409,
        code: 'WORKFLOW_TARGET_CLOSED',
        key: 'apiErrors.request.invalid_status'
      })
    }
    const setup = await resolveRetryableWorkflowSetup(trx, currentContext, body.runtimeId, true, body.purpose)
    if (!setup) return null
    return await startWorkflow(
      event,
      trx,
      currentContext,
      actorUserId,
      {
        retry: true,
        retrySetupId: String(setup.id),
        retryRuntimeId: String(setup.previousRuntimeId),
        purpose: body.purpose
      }
    )
  }
  const run = extensionRuntime
    ? await executeExtensionLifecycleWrite(event, extensionRuntime, async (trx, current, actorUserId) =>
        await retryCurrent(trx, current.context, actorUserId))
    : await executeFreshAuthorizedReviewRuntimeWrite(event, context, async (trx, currentContext) => {
        const currentUser = await resolveCurrentCommonUser(event, trx)
        if (!currentUser) return await unauthorized(event)
        return await retryCurrent(trx, currentContext, currentUser.id)
      })
  if (!run) {
    return await throwApiError(event, {
      statusCode: 409,
      code: 'WORKFLOW_RETRY_NOT_ALLOWED',
      key: 'apiErrors.request.invalid_status'
    })
  }
  return {
    runtimeId: String(run.id),
    runtimeState: run.egcs_cn_state,
    attempt: Number(run.egcs_cn_attempt),
    previousRuntimeId: run.egcs_cn_previousruntime === null ? null : String(run.egcs_cn_previousruntime)
  }
})
