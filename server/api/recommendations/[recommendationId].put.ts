import { notFound, unauthorized } from '~~/server/utils/api-errors'
import { getValidatedQueryI18n, readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { saveRecommendationById } from '~~/server/utils/recommendation-runtime'
import {
  executeFreshAuthorizedReviewRuntimeWrite,
  resolveReviewRuntimeEntityFromRecommendation
} from '~~/server/utils/review-runtime-access'
import { WorkflowRecommendationSaveSchema } from '~~/shared/types/schemas/workflow'
import { requireAuthContext } from '~~/server/utils/authorize'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { z } from 'zod'

export const RecommendationSaveQuerySchema = z.object({
  submit: z.enum(['true', 'false'], { error: 'validation.invalid_selection' }).default('false')
}).strict()

export default defineEventHandler(async event => {
  const recommendationId = getRouterParam(event, 'recommendationId')
  if (!recommendationId) {
    return await notFound(event, 'RECOMMENDATION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  await requireAuthContext(event)
  const query = await getValidatedQueryI18n(event, RecommendationSaveQuerySchema)
  if (!isPositivePostgresBigintText(recommendationId)) {
    return await notFound(event, 'RECOMMENDATION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  const body = await readValidatedBodyI18n(event, WorkflowRecommendationSaveSchema)
  const submit = query.submit === 'true'
  const context = await resolveReviewRuntimeEntityFromRecommendation(event.context.$db, recommendationId)
  if (!context) {
    return await notFound(event, 'RECOMMENDATION_TARGET_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  return await executeFreshAuthorizedReviewRuntimeWrite(event, context, async trx => {
    const user = await resolveCurrentCommonUser(event, trx)
    if (!user) return await unauthorized(event)
    return await saveRecommendationById(event, recommendationId, body.responses, submit, user.id, trx, body.revision)
  })
})
