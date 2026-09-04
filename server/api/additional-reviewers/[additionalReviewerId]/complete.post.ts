import { badRequest, forbidden, notFound } from '~~/server/utils/api-errors'
import { requireAuthContext } from '~~/server/utils/authorize'
import {
  resolveAdditionalReviewerRowContext,
  resolveCurrentCommonUser
} from '~~/server/utils/additional-reviewer-runtime'
import {
  authorizeReviewRuntimeAction,
  executeFreshAuthorizedReviewAdditionalReviewerWrite
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

  await authorizeReviewRuntimeAction(event, 'read_assessment', rowContext.runtimeEntity)
  const currentCommonUser = await resolveCurrentCommonUser(event)
  if (!currentCommonUser || currentCommonUser.id !== rowContext.row.assignedUserId) {
    return await forbidden(event)
  }

  if (rowContext.row.completedAt) {
    return await badRequest(event, 'ADDITIONAL_REVIEWER_ALREADY_COMPLETED', 'apiErrors.request.invalid')
  }

  const { completedAt, updated } = await executeFreshAuthorizedReviewAdditionalReviewerWrite(
    event,
    rowContext.runtimeEntity,
    async trx => {
      const currentRowContext = await resolveAdditionalReviewerRowContext(trx, additionalReviewerId)
      if (!currentRowContext) {
        return await notFound(event, 'ADDITIONAL_REVIEWER_NOT_FOUND', 'apiErrors.admin_common.not_found')
      }
      await assertReviewNotLocked(
        event,
        currentRowContext.reviewRuntimeState,
        currentRowContext.reviewSetRuntimeState
      )

      const freshCommonUser = await resolveCurrentCommonUser(event, trx)
      if (!freshCommonUser || freshCommonUser.id !== currentRowContext.row.assignedUserId) {
        return await forbidden(event)
      }
      if (currentRowContext.row.completedAt) {
        return await badRequest(event, 'ADDITIONAL_REVIEWER_ALREADY_COMPLETED', 'apiErrors.request.invalid')
      }

      const freshCompletedAt = new Date()
      const freshUpdated = await trx
        .updateTable('Common_Additional_Reviewers')
        .set({
          egcs_cn_completedat: freshCompletedAt
        })
        .where('id', '=', additionalReviewerId)
        .where('_deleted', '=', false)
        .where('egcs_cn_completedat', 'is', null)
        .returning('id')
        .executeTakeFirst()

      if (!freshUpdated) {
        return await badRequest(event, 'ADDITIONAL_REVIEWER_ALREADY_COMPLETED', 'apiErrors.request.invalid')
      }

      return { completedAt: freshCompletedAt, updated: freshUpdated }
    }
  )

  return {
    id: String(updated.id),
    egcs_cn_completedat: completedAt.toISOString()
  }
})
