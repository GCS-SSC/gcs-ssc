import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeReviewRuntimeAction, executeFreshAuthorizedReviewRuntimeWrite } from '~~/server/utils/review-runtime-access'
import { resolveCompletionRuntimeEntityFromEntity, respondCompletionRuntimeEntityNotFound } from '~~/server/utils/completion-runtime'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { resolvePublishedStandardWorkflowSetups, startWorkflow } from '~~/server/utils/workflow-runtime'
import { WorkflowStartSchema } from '~~/shared/types/schemas/workflow'
import { getDatabaseConstraintName } from '~~/server/utils/database-constraint-errors'
import { throwApiError } from '~~/server/utils/api-errors'
import { resolveEntityTypeLifecycleDefinition } from '~~/server/utils/entity-type-registry'
import {
  authorizeExtensionLifecycleRead,
  executeExtensionLifecycleWrite,
  resolveExtensionLifecycleRuntime
} from '~~/server/utils/extension-lifecycle-runtime'

export default defineEventHandler(async event => {
  const body = await readValidatedBodyI18n(event, WorkflowStartSchema)
  const entityDefinition = await resolveEntityTypeLifecycleDefinition(event.context.$db, body.entityType)
  const explicitlySupported = entityDefinition && (
    (body.purpose === 'standard' && entityDefinition.standardWorkflow === 'explicit')
    || (body.purpose === 'approval_submission' && entityDefinition.approvalSubmission === 'explicit')
    || (body.purpose === 'risk_rating' && entityDefinition.riskRating === 'explicit')
  )
  if (!explicitlySupported) {
    return await throwApiError(event, {
      statusCode: 409,
      code: 'WORKFLOW_EXPLICIT_START_NOT_ALLOWED',
      key: 'apiErrors.workflow.explicit_start_not_allowed'
    })
  }
  const extensionRuntime = body.entityType.includes(':')
    ? await resolveExtensionLifecycleRuntime(event, body.entityType, body.entityId)
    : null
  const context = extensionRuntime?.context
    ?? await resolveCompletionRuntimeEntityFromEntity(event.context.$db, body.entityType, body.entityId)
  if (!context) return await respondCompletionRuntimeEntityNotFound(event, body.entityType)
  if (extensionRuntime) await authorizeExtensionLifecycleRead(event, extensionRuntime)
  else await authorizeReviewRuntimeAction(event, 'save_assessment', context)
  let run: Awaited<ReturnType<typeof startWorkflow>> | null | undefined
  try {
    /** Starts the selected Workflow in the caller's already-authorized transaction.
     * @param trx - Open host transaction.
     * @param currentContext - Freshly resolved target context.
     * @param currentUserId - Common user initiating the Workflow.
     * @returns The created Workflow run, or null when no setup applies.
     */
    const startCurrent = async (trx: Parameters<typeof startWorkflow>[1], currentContext: typeof context, currentUserId: string) => {
      if (currentContext.isOpen === false) {
        return await throwApiError(event, {
          statusCode: 409,
          code: 'WORKFLOW_TARGET_CLOSED',
          key: 'apiErrors.request.invalid_status'
        })
      }
      const selectedSetup = body.purpose === 'standard'
        ? (await resolvePublishedStandardWorkflowSetups(trx, currentContext, body.workflowSetupId, true))[0]
        : undefined
      if (body.purpose === 'standard' && !selectedSetup) {
        return await throwApiError(event, {
          statusCode: 409,
          code: 'WORKFLOW_SETUP_UNPUBLISHED',
          key: 'apiErrors.workflow.setup_unpublished'
        })
      }
      return await startWorkflow(event, trx, currentContext, currentUserId, {
        purpose: body.purpose,
        selectedSetup
      })
    }
    run = extensionRuntime
      ? await executeExtensionLifecycleWrite(event, extensionRuntime, async (trx, current, actorUserId) =>
          await startCurrent(trx, current.context, actorUserId))
      : await executeFreshAuthorizedReviewRuntimeWrite(event, context, async (trx, currentContext) => {
          const currentUser = await resolveCurrentCommonUser(event, trx)
          if (!currentUser) return await unauthorized(event)
          return await startCurrent(trx, currentContext, currentUser.id)
        })
  } catch (error) {
    // Defensive adapter mapping retained for mocked/legacy workflow implementations; the shared
    // start helper performs the same mapping for every production caller.
    if (getDatabaseConstraintName(error) === 'cn_chk_runtimeitempublished') {
      return await throwApiError(event, {
        statusCode: 409,
        code: 'WORKFLOW_PUBLICATION_UNAVAILABLE',
        key: 'apiErrors.request.invalid_status'
      })
    }
    throw error
  }
  if (!run) return await badRequest(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
  return {
    runtimeId: String(run.id),
    runtimeState: run.egcs_cn_state,
    attempt: Number(run.egcs_cn_attempt),
    previousRuntimeId: run.egcs_cn_previousruntime === null ? null : String(run.egcs_cn_previousruntime)
  }
})
