import { getValidatedQueryI18n, readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { executeFreshAuthorizedCurrentRecommendationWrite } from '~~/server/utils/review-runtime-access'
import { resolveCompletionRuntimeEntityFromEntity, respondCompletionRuntimeEntityNotFound } from '~~/server/utils/completion-runtime'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { saveCurrentRecommendation } from '~~/server/utils/recommendation-runtime'
import { WorkflowRecommendationSaveSchema, WorkflowRuntimeQuerySchema } from '~~/shared/types/schemas/workflow'
import {
  authorizeExtensionLifecycleRead,
  resolveExtensionLifecycleRuntime
} from '~~/server/utils/extension-lifecycle-runtime'

// eslint-disable-next-line local/require-authorize -- exact Recommendation assignment is revalidated in the locked transaction
export default defineEventHandler(async event => {
  const query = await getValidatedQueryI18n(event, WorkflowRuntimeQuerySchema)
  const body = await readValidatedBodyI18n(event, WorkflowRecommendationSaveSchema)
  const extensionRuntime = query.entityType.includes(':')
    ? await resolveExtensionLifecycleRuntime(event, query.entityType, query.entityId)
    : null
  const context = extensionRuntime?.context
    ?? await resolveCompletionRuntimeEntityFromEntity(event.context.$db, query.entityType, query.entityId)
  if (!context) return await respondCompletionRuntimeEntityNotFound(event, query.entityType)
  if (extensionRuntime) await authorizeExtensionLifecycleRead(event, extensionRuntime)
  return await executeFreshAuthorizedCurrentRecommendationWrite(event, context, async (trx, currentContext) => {
    const currentUser = await resolveCurrentCommonUser(event, trx)
    if (!currentUser) return await unauthorized(event)
    return await saveCurrentRecommendation(
      event,
      currentContext,
      body.responses,
      true,
      currentUser.id,
      trx,
      query.purpose,
      body.revision
    )
  })
})
