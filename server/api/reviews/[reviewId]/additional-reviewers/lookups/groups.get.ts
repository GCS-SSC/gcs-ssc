import { requireAuthContext } from '~~/server/utils/authorize'
import { resolveAdditionalReviewerExecutableContextFromReview } from '~~/server/utils/additional-reviewer-runtime'
import { authorizeReviewRuntimeAction } from '~~/server/utils/review-runtime-access'
import { notFound } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const reviewId = getRouterParam(event, 'reviewId') ?? ''
  const context = await resolveAdditionalReviewerExecutableContextFromReview(event.context.$db, reviewId)
  if (!context?.runtimeEntity.schemaAgencyId) return await notFound(event, 'REVIEW_NOT_FOUND', 'apiErrors.admin_common.not_found')
  await authorizeReviewRuntimeAction(event, 'save_assessment', context.runtimeEntity)
  const groups = await event.context.$db.selectFrom('Common_Group')
    .select(['id', 'egcs_cn_name_en', 'egcs_cn_name_fr'])
    .where('egcs_cn_agency', '=', context.runtimeEntity.schemaAgencyId)
    .where('_deleted', '=', false).orderBy('egcs_cn_name_en').execute()
  return { items: groups.map(group => ({ ...group, id: String(group.id) })) }
})
