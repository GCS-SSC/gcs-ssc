import { z } from 'zod'
import { PaginationSchema } from '~~/shared/types/schemas'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import {
  listAgencyScopedCommonUsersPage,
  resolveAdditionalReviewerExecutableContextFromReview
} from '~~/server/utils/additional-reviewer-runtime'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { authorizeReviewRuntimeAction } from '~~/server/utils/review-runtime-access'
import { requireAuthContext } from '~~/server/utils/authorize'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const UserLookupQuerySchema = PaginationSchema.extend({
  search: z.string().optional()
})

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
  const { search, page, limit } = await getValidatedQueryI18n(event, UserLookupQuerySchema)

  const executableContext = await resolveAdditionalReviewerExecutableContextFromReview(db, reviewId)
  if (!executableContext) {
    return await notFound(event, 'ASSESSMENT_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  await authorizeReviewRuntimeAction(event, 'save_assessment', executableContext.runtimeEntity)

  if (!executableContext.runtimeEntity.schemaAgencyId) {
    return await badRequest(event, 'MISSING_SCHEMA_AGENCY', 'apiErrors.request.invalid')
  }

  const result = await listAgencyScopedCommonUsersPage(
    db,
    executableContext.runtimeEntity.schemaAgencyId,
    page,
    limit,
    search
  )

  return {
    items: result.items,
    total: result.total,
    stats: {
      total: result.total,
      // Agency-scoped assignee lookup only returns assignable, non-deleted Common_User rows,
      // so every row in this runtime lookup is considered active by definition.
      active: result.total
    },
    page,
    limit
  }
})
