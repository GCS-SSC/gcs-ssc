import { z } from 'zod'
import { requireAuthContext } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { executeEntityAssignmentManagement } from '~~/server/utils/entity-assignment-write'
import { isAssignableGroup } from '~~/server/utils/groups'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const Body = z.object({ egcs_cn_group: PositivePostgresBigintIdSchema.nullable() }).strict()

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const reviewId = getRouterParam(event, 'reviewId') ?? ''
  if (!isPositivePostgresBigintText(reviewId)) return await notFound(event, 'REVIEW_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const body = await readValidatedBodyI18n(event, Body)
  return await executeEntityAssignmentManagement(event, { entityType: 'commonreview', entityId: reviewId }, async trx => {
    const review = await trx.selectFrom('Common_Review')
      .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review.egcs_cn_reviewschema')
      .select(['Common_Review.id', 'Common_Review_Schema.egcs_cn_agency'])
      .where('Common_Review.id', '=', reviewId).where('Common_Review._deleted', '=', false)
      .forUpdate('Common_Review').executeTakeFirst()
    if (!review) return await notFound(event, 'REVIEW_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (body.egcs_cn_group && !await isAssignableGroup(trx, body.egcs_cn_group, String(review.egcs_cn_agency))) {
      return await badRequest(event, 'REVIEW_GROUP_INVALID', 'apiErrors.request.invalid')
    }
    const updated = await trx.updateTable('Common_Review').set({
      egcs_cn_group: body.egcs_cn_group,
      egcs_cn_groupclaimedby: null
    }).where('id', '=', reviewId).returning(['id', 'egcs_cn_group', 'egcs_cn_groupclaimedby']).executeTakeFirstOrThrow()
    return { id: String(updated.id), egcs_cn_group: updated.egcs_cn_group ? String(updated.egcs_cn_group) : null, egcs_cn_groupclaimedby: null }
  })
})
