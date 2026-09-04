import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import {
  assertDirectCompletionRuntimeEntitySupported,
  getCompletionRuntime,
  resolveCompletionRuntimeEntityFromEntity,
  respondCompletionRuntimeEntityNotFound
} from '~~/server/utils/completion-runtime'
import { authorizeReviewRuntimeAction } from '~~/server/utils/review-runtime-access'
import { CompletionRuntimeQuerySchema } from '~~/shared/types/schemas/completion'
import { authorizeExtensionLifecycleRead, resolveExtensionLifecycleRuntime } from '~~/server/utils/extension-lifecycle-runtime'
import { resolveActiveWorkflowSetup } from '~~/server/utils/workflow-runtime'
import type { H3Event } from 'h3'
import type { Entity_Type } from '~~/shared/types/database'
import { isCoreEntityType, requiresApprovalSubmissionAtCompletion } from '~~/shared/constants/entity-registry'
import { requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'

type CompletionTarget = {
  entityType: Entity_Type
  entityId: string
}

/**
 * Adds point-in-time Workflow blockers to the domain-specific Completion projection.
 * @param event Active request and database context.
 * @param completionTarget Exact entity receiving Completion evidence.
 * @param runtimeEntity Resolved lifecycle context used for authorization and setup lookup.
 * @param runtime Domain-specific Completion projection.
 * @param runtime.item Existing immutable Completion evidence.
 * @param runtime.can_complete Whether domain rules otherwise permit Completion.
 * @param runtime.blocker Domain-specific reason Completion is unavailable.
 * @returns The projection with an active-workflow or Closeout-configuration blocker.
 */
const withCompletionBlocker = async (
  event: H3Event,
  completionTarget: CompletionTarget,
  runtimeEntity: Awaited<ReturnType<typeof resolveCompletionRuntimeEntityFromEntity>>,
  runtime: { item: unknown, can_complete: boolean, blocker?: string | null }
) => {
  if (!runtimeEntity || runtime.item || typeof event.context.$db.selectFrom !== 'function') return runtime
  const active = await event.context.$db.selectFrom('Common_Runtime').select('id')
    .where('egcs_cn_kind', '=', 'workflow')
    .where('egcs_cn_entitytype', '=', completionTarget.entityType)
    .where('egcs_cn_entityid', '=', completionTarget.entityId)
    .where('egcs_cn_state', 'in', ['pending', 'active', 'awaiting_action', 'paused'])
    .where('_deleted', '=', false).executeTakeFirst()
  if (active) return { ...runtime, can_complete: false, blocker: 'active_workflow' as const }
  if (isCoreEntityType(runtimeEntity.entityType)
    && requiresApprovalSubmissionAtCompletion(runtimeEntity.entityType)
    && !await resolveActiveWorkflowSetup(event.context.$db, runtimeEntity, 'approval_submission')) {
    return { ...runtime, can_complete: false, blocker: 'approval_workflow_missing' as const }
  }
  return runtime
}

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const { entityType, entityId } = await getValidatedQueryI18n(event, CompletionRuntimeQuerySchema)
  return await event.context.$db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    await requireFreshAuthContext(event, trx)
    event.context.$db = trx
    const unsupportedEntityResult = await assertDirectCompletionRuntimeEntitySupported(event, entityType)

    if (unsupportedEntityResult) {
      return unsupportedEntityResult
    }

    if (entityType?.includes(':')) {
      const extensionRuntime = await resolveExtensionLifecycleRuntime(event, entityType, entityId)
      if (!extensionRuntime) return await respondCompletionRuntimeEntityNotFound(event, entityType)
      await authorizeExtensionLifecycleRead(event, extensionRuntime)
      const runtime = await getCompletionRuntime(event, entityType, entityId)
      return runtime
        ? await withCompletionBlocker(event, { entityType, entityId }, extensionRuntime.context, runtime)
        : await respondCompletionRuntimeEntityNotFound(event, entityType)
    }

    const runtimeEntity = await resolveCompletionRuntimeEntityFromEntity(event.context.$db, entityType, entityId)
    if (!runtimeEntity) {
      return await respondCompletionRuntimeEntityNotFound(event, entityType)
    }

    await authorizeReviewRuntimeAction(event, 'read_assessment', runtimeEntity)

    const runtime = await getCompletionRuntime(event, entityType, entityId)
    if (!runtime) {
      return await respondCompletionRuntimeEntityNotFound(event, entityType)
    }

    return await withCompletionBlocker(event, { entityType, entityId }, runtimeEntity, runtime)
  })
})
