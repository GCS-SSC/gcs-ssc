import { badRequest, notFound } from '~~/server/utils/api-errors'
import { requireAuthContext } from '~~/server/utils/authorize'
import { resolveAdditionalReviewerRowContext } from '~~/server/utils/additional-reviewer-runtime'
import {
  authorizeReviewRuntimeAction,
  executeFreshAuthorizedReviewRuntimeDelete
} from '~~/server/utils/review-runtime-access'
import { assertReviewNotLocked } from '~~/server/utils/review-runtime-state'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const db = event.context.$db
  const additionalReviewerId = getRouterParam(event, 'additionalReviewerId')

  if (!additionalReviewerId) {
    return await badRequest(event, 'MISSING_ADDITIONAL_REVIEWER_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(additionalReviewerId)) {
    return await notFound(event, 'ADDITIONAL_REVIEWER_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  const rowContext = await resolveAdditionalReviewerRowContext(db, additionalReviewerId)
  if (!rowContext) {
    return await notFound(event, 'ADDITIONAL_REVIEWER_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  await authorizeReviewRuntimeAction(event, 'delete_assessment_child', rowContext.runtimeEntity)
  await executeFreshAuthorizedReviewRuntimeDelete(event, rowContext.runtimeEntity, async trx => {
    const currentRowContext = await resolveAdditionalReviewerRowContext(trx, additionalReviewerId)
    if (!currentRowContext) {
      return await notFound(event, 'ADDITIONAL_REVIEWER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    }
    await assertReviewNotLocked(
      event,
      currentRowContext.reviewRuntimeState,
      currentRowContext.reviewSetRuntimeState
    )

    await trx
      .updateTable('Common_Additional_Reviewers')
      .set({
        _deleted: true
      })
      .where('id', '=', additionalReviewerId)
      .where('_deleted', '=', false)
      .execute()
  })

  return {
    success: true
  }
})
