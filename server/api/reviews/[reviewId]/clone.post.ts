import { badRequest, notFound } from '~~/server/utils/api-errors'
import {
  authorizeReviewRuntimeAction,
  executeFreshAuthorizedReviewRuntimeWrite,
  resolveReviewRuntimeEntityFromReview
} from '~~/server/utils/review-runtime-access'
import { cloneDeniedRuntimeReview } from '~~/server/utils/review-runtime'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { requireAuthContext } from '~~/server/utils/authorize'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const reviewId = getRouterParam(event, 'reviewId')

  if (!reviewId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(reviewId)) {
    return await notFound(event, 'REVIEW_NOT_FOUND', 'apiErrors.review.review_not_found')
  }

  // Clone resolves from the review row so the caller only needs the runtime review id.
  const runtimeEntity = await resolveReviewRuntimeEntityFromReview(db, reviewId)
  if (!runtimeEntity) {
    return await notFound(event, 'REVIEW_NOT_FOUND', 'apiErrors.review.review_not_found')
  }

  await authorizeReviewRuntimeAction(event, 'clone_review', runtimeEntity)
  const actor = await resolveCurrentCommonUser(event)
  if (!actor) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')

  const result = await executeFreshAuthorizedReviewRuntimeWrite(
    event,
    runtimeEntity,
    async (trx, currentEntity) => await cloneDeniedRuntimeReview(
      trx,
      String(currentEntity.reviewSetId),
      reviewId,
      currentEntity.entityType,
      currentEntity.entityId,
      actor.id
    )
  )

  if (result === null) {
    return await notFound(event, 'REVIEW_SET_NOT_FOUND', 'apiErrors.review.review_set_not_found')
  }

  if (result === 'REVIEW_NOT_FOUND') {
    return await notFound(event, 'REVIEW_NOT_FOUND', 'apiErrors.review.review_not_found')
  }

  if (result === 'REVIEW_NOT_DENIED') {
    return await badRequest(event, 'REVIEW_NOT_DENIED', 'apiErrors.review.review_not_denied')
  }

  return result
})
