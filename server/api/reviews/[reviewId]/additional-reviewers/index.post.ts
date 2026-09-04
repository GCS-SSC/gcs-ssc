import { badRequest, notFound } from '~~/server/utils/api-errors'
import {
  listAgencyScopedCommonUsers,
  resolveAdditionalReviewerExecutableContextFromReview,
  resolveCurrentCommonUser
} from '~~/server/utils/additional-reviewer-runtime'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { AdditionalReviewerInputSchema } from '~~/shared/types/schemas/additional-reviewer'
import {
  authorizeReviewRuntimeAction,
  executeFreshAuthorizedReviewRuntimeWrite
} from '~~/server/utils/review-runtime-access'
import { assertReviewNotLocked } from '~~/server/utils/review-runtime-state'
import { requireAuthContext } from '~~/server/utils/authorize'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const reviewId = getRouterParam(event, 'reviewId')

  if (!reviewId) {
    return await badRequest(event, 'MISSING_REVIEW_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(reviewId)) {
    return await notFound(event, 'ASSESSMENT_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  const executableContext = await resolveAdditionalReviewerExecutableContextFromReview(db, reviewId)
  if (!executableContext) {
    return await notFound(event, 'ASSESSMENT_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  // Creating a row is treated as executing more review work on the parent entity, so it follows
  // the same update gate as saving the assessment instead of inventing a review-only permission.
  await authorizeReviewRuntimeAction(event, 'save_assessment', executableContext.runtimeEntity)
  const body = await readValidatedBodyI18n(event, AdditionalReviewerInputSchema)
  const result = await executeFreshAuthorizedReviewRuntimeWrite(
    event,
    executableContext.runtimeEntity,
    async trx => {
      const currentExecutableContext = await resolveAdditionalReviewerExecutableContextFromReview(trx, reviewId)
      if (!currentExecutableContext) {
        return await notFound(event, 'ASSESSMENT_NOT_FOUND', 'apiErrors.admin_common.not_found')
      }
      await assertReviewNotLocked(
        event,
        currentExecutableContext.reviewRuntimeState,
        currentExecutableContext.reviewSetRuntimeState
      )
      if (!currentExecutableContext.runtimeEntity.schemaAgencyId) {
        return await badRequest(event, 'MISSING_SCHEMA_AGENCY', 'apiErrors.request.invalid')
      }

      const allowedUsers = await listAgencyScopedCommonUsers(
        trx,
        currentExecutableContext.runtimeEntity.schemaAgencyId
      )
      if (!allowedUsers.some(user => user.id === body.egcs_cn_user)) {
        return await badRequest(event, 'ADDITIONAL_REVIEWER_ASSIGNEE_INVALID', 'apiErrors.request.invalid')
      }

      const currentCommonUser = await resolveCurrentCommonUser(event, trx)
      if (!currentCommonUser) {
        return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
      }

      const created = await trx
        .insertInto('Common_Additional_Reviewers')
        .values({
          egcs_cn_entitytype: 'commonreview',
          egcs_cn_entityid: reviewId,
          // Comments belong to the reviewer after assignment, so create always starts blank even if
          // a caller submits comment text in the payload.
          egcs_cn_comments: '',
          egcs_cn_user: body.egcs_cn_user,
          egcs_cn_completedat: null,
          _deleted: false
        })
        .returning([
          'id',
          'egcs_cn_comments',
          'egcs_cn_user',
          'egcs_cn_completedat'
        ])
        .executeTakeFirstOrThrow()

      return {
        assignedUserName: allowedUsers.find(user => user.id === body.egcs_cn_user)?.name ?? '',
        created,
        currentOwnsRow: currentCommonUser.id === body.egcs_cn_user
      }
    }
  )

  return {
    id: String(result.created.id),
    egcs_cn_comments: result.created.egcs_cn_comments ?? '',
    egcs_cn_user: String(result.created.egcs_cn_user),
    egcs_cn_user_name: result.assignedUserName,
    egcs_cn_completedat: result.created.egcs_cn_completedat ? new Date(result.created.egcs_cn_completedat).toISOString() : null,
    can_update: result.currentOwnsRow,
    can_complete: result.currentOwnsRow
  }
})
