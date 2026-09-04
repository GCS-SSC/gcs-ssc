import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import {
  assertDirectCompletionRuntimeEntitySupported,
  executeCompletion,
  resolveCompletionRuntimeEntityFromEntity,
  respondCompletionRuntimeEntityNotFound
} from '~~/server/utils/completion-runtime'
import { authorizeReviewRuntimeAction } from '~~/server/utils/review-runtime-access'
import { CompletionExecuteSchema } from '~~/shared/types/schemas/completion'
import { authorizeExtensionLifecycleRead, resolveExtensionLifecycleRuntime } from '~~/server/utils/extension-lifecycle-runtime'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const body = await readValidatedBodyI18n(event, CompletionExecuteSchema)
  const unsupportedEntityResult = await assertDirectCompletionRuntimeEntitySupported(event, body.entityType)

  if (unsupportedEntityResult) {
    return unsupportedEntityResult
  }

  if (body.entityType.includes(':')) {
    const extensionRuntime = await resolveExtensionLifecycleRuntime(event, body.entityType, body.entityId)
    if (!extensionRuntime) return await respondCompletionRuntimeEntityNotFound(event, body.entityType)
    await authorizeExtensionLifecycleRead(event, extensionRuntime)
    const runtime = await executeCompletion(event, body)
    return runtime ?? await respondCompletionRuntimeEntityNotFound(event, body.entityType)
  }

  const runtimeEntity = await resolveCompletionRuntimeEntityFromEntity(event.context.$db, body.entityType, body.entityId)
  if (!runtimeEntity) {
    return await respondCompletionRuntimeEntityNotFound(event, body.entityType)
  }

  await authorizeReviewRuntimeAction(event, 'save_assessment', runtimeEntity)

  const runtime = await executeCompletion(event, body)
  if (!runtime) {
    return await respondCompletionRuntimeEntityNotFound(event, body.entityType)
  }

  return runtime
})
