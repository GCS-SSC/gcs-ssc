import { badRequest, notFound } from '~~/server/utils/api-errors'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import {
  getChecklistMutationReview,
  persistPreparedChecklist,
  prepareChecklistPersistence
} from '~~/server/utils/checklist-runtime-persistence'
import {
  authorizeReviewRuntimeAction,
  executeFreshAuthorizedReviewRuntimeWrite,
  resolveReviewRuntimeEntityFromReview
} from '~~/server/utils/review-runtime-access'
import { assertReviewNotLocked } from '~~/server/utils/review-runtime-state'
import { ChecklistResponseEnvelopeSchema } from '~~/shared/types/schemas/checklist/checklist'
import { requireAuthContext } from '~~/server/utils/authorize'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const reviewId = getRouterParam(event, 'reviewId')
  if (!reviewId) return await badRequest(event, 'MISSING_REVIEW_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(reviewId)) {
    return await notFound(event, 'CHECKLIST_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  const [review, runtimeEntity] = await Promise.all([
    getChecklistMutationReview(db, reviewId),
    resolveReviewRuntimeEntityFromReview(db, reviewId)
  ])
  if (!review || !runtimeEntity) {
    return await notFound(event, 'CHECKLIST_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  await authorizeReviewRuntimeAction(event, 'save_assessment', runtimeEntity)
  await assertReviewNotLocked(event, review.runtimeState, review.reviewSetRuntimeState)
  const body = await readValidatedBodyI18n(event, ChecklistResponseEnvelopeSchema)
  if (!body) return await badRequest(event, 'INVALID_CHECKLIST_RESPONSE', 'apiErrors.request.validation_failed')

  const result = await executeFreshAuthorizedReviewRuntimeWrite(event, runtimeEntity, async trx => {
    const lockedReview = await getChecklistMutationReview(trx, reviewId)
    if (!lockedReview) return await notFound(event, 'CHECKLIST_NOT_FOUND', 'apiErrors.admin_common.not_found')
    await assertReviewNotLocked(event, lockedReview.runtimeState, lockedReview.reviewSetRuntimeState)
    const lockedPrepared = await prepareChecklistPersistence(event, lockedReview, body, { enforceCompletion: false })
    await persistPreparedChecklist(trx, lockedReview, lockedPrepared)
    return { prepared: lockedPrepared, review: lockedReview }
  })
  if (!('review' in result)) return result

  return {
    id: reviewId,
    runtimeId: String(result.review.runtimeId),
    runtimeItemId: String(result.review.runtimeItemId),
    runtimeState: result.review.runtimeState,
    attempt: Number(result.review.attempt),
    previousRuntimeId: result.review.previousRuntimeId === null ? null : String(result.review.previousRuntimeId),
    checklistDefinition: result.prepared.definition,
    checklistResponse: {
      responses: result.prepared.response.responses,
      result: result.prepared.evaluation.result,
      evaluationTrace: result.prepared.evaluation.trace
    }
  }
})
