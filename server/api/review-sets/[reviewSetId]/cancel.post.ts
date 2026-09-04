import { badRequest, notFound } from '~~/server/utils/api-errors'
import {
  authorizeReviewRuntimeAction,
  executeFreshAuthorizedReviewRuntimeWrite,
  resolveReviewRuntimeEntityFromReviewSet
} from '~~/server/utils/review-runtime-access'
import { cancelRuntimeReviewSetInTransaction } from '~~/server/utils/review-runtime'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { requireAuthContext } from '~~/server/utils/authorize'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const reviewSetId = getRouterParam(event, 'reviewSetId')

  if (!reviewSetId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  await requireAuthContext(event)
  if (!isPositivePostgresBigintText(reviewSetId)) {
    return await notFound(event, 'REVIEW_SET_NOT_FOUND', 'apiErrors.review.review_set_not_found')
  }

  // Cancel resolves through the review set so the route can stay activity-specific instead of
  // nesting under a single entity folder.
  const runtimeEntity = await resolveReviewRuntimeEntityFromReviewSet(db, reviewSetId)
  if (!runtimeEntity) {
    return await notFound(event, 'REVIEW_SET_NOT_FOUND', 'apiErrors.review.review_set_not_found')
  }

  try {
    await authorizeReviewRuntimeAction(event, 'cancel_review_set', runtimeEntity)
  } catch (error: unknown) {
    if ((error as { statusCode?: number }).statusCode === 403) {
      return await notFound(event, 'REVIEW_SET_NOT_FOUND', 'apiErrors.review.review_set_not_found')
    }
    throw error
  }
  const actor = await resolveCurrentCommonUser(event)
  if (!actor) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')

  const result = await executeFreshAuthorizedReviewRuntimeWrite(
    event,
    runtimeEntity,
    async (trx, currentEntity) => await cancelRuntimeReviewSetInTransaction(
      trx,
      reviewSetId,
      currentEntity.entityType,
      currentEntity.entityId,
      actor.id
    )
  )
  if (result === null) {
    return await notFound(event, 'REVIEW_SET_NOT_FOUND', 'apiErrors.review.review_set_not_found')
  }

  if (result === 'TERMINAL') {
    return await badRequest(event, 'REVIEW_SET_TERMINAL', 'apiErrors.review.review_set_terminal')
  }

  return result
})
