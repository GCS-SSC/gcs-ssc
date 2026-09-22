import { requireAuthContext } from '~~/server/utils/authorize'
import { executeEntityAssignmentManagement } from '~~/server/utils/entity-assignment-write'
import { notFound } from '~~/server/utils/api-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const reviewId = getRouterParam(event, 'reviewId') ?? ''
  if (!isPositivePostgresBigintText(reviewId)) return await notFound(event, 'REVIEW_NOT_FOUND', 'apiErrors.admin_common.not_found')
  return await executeEntityAssignmentManagement(event, { entityType: 'commonreview', entityId: reviewId }, async trx => {
    const review = await trx.selectFrom('Common_Review')
      .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review.egcs_cn_reviewschema')
      .select('Common_Review_Schema.egcs_cn_agency')
      .where('Common_Review.id', '=', reviewId).where('Common_Review._deleted', '=', false).executeTakeFirst()
    if (!review) return await notFound(event, 'REVIEW_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const groups = await trx.selectFrom('Common_Group').select(['id', 'egcs_cn_name_en', 'egcs_cn_name_fr'])
      .where('egcs_cn_agency', '=', String(review.egcs_cn_agency)).where('_deleted', '=', false)
      .orderBy('egcs_cn_name_en').execute()
    return { items: groups.map(group => ({ ...group, id: String(group.id) })) }
  })
})
