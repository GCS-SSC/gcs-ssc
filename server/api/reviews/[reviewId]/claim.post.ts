import { forbidden, notFound, throwApiError } from '~~/server/utils/api-errors'
import { requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { resolveAgencyValidEntityAssigneeIdsWithDb } from '~~/server/utils/entity-assignment'
import { getReviewRuntimeOwnerAgencyId, lockReviewRuntimeTarget, resolveReviewRuntimeEntityFromReview } from '~~/server/utils/review-runtime-access'
import { assertReviewNotLocked } from '~~/server/utils/review-runtime-state'
import { isActiveGroupMember } from '~~/server/utils/groups'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const id = getRouterParam(event, 'reviewId') ?? ''
  if (!isPositivePostgresBigintText(id)) return await notFound(event, 'REVIEW_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const context = await resolveReviewRuntimeEntityFromReview(event.context.$db, id)
  if (!context) return await notFound(event, 'REVIEW_NOT_FOUND', 'apiErrors.admin_common.not_found')
  return await event.context.$db.transaction().execute(async trx => {
    await requireFreshAuthContext(event, trx)
    await lockReviewRuntimeTarget(trx, context)
    const fresh = await resolveReviewRuntimeEntityFromReview(trx, id)
    if (!fresh || fresh.entityType !== context.entityType || fresh.entityId !== context.entityId
      || fresh.reviewSetId !== context.reviewSetId) {
      return await throwApiError(event, { statusCode: 409, code: 'REVIEW_OWNER_CHANGED', key: 'apiErrors.request.invalid_status' })
    }
    const review = await trx.selectFrom('Common_Review')
      .innerJoin('Common_Review_Set', 'Common_Review_Set.id', 'Common_Review.egcs_cn_reviewset')
      .innerJoin('Common_Runtime_Item as Review_Item', 'Review_Item.id', 'Common_Review.egcs_cn_runtimeitem')
      .innerJoin('Common_Runtime_Item as Set_Item', 'Set_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
      .select(['Common_Review.egcs_cn_group', 'Common_Review.egcs_cn_groupclaimedby',
        'Review_Item.egcs_cn_state as reviewState', 'Set_Item.egcs_cn_state as setState'])
      .where('Common_Review.id', '=', id).where('Common_Review._deleted', '=', false).executeTakeFirst()
    if (!review) return await notFound(event, 'REVIEW_NOT_FOUND', 'apiErrors.admin_common.not_found')
    await assertReviewNotLocked(event, review.reviewState, review.setState)
    if (!review.egcs_cn_group || review.egcs_cn_groupclaimedby) {
      return await throwApiError(event, { statusCode: 409, code: 'GROUP_WORK_ALREADY_CLAIMED', key: 'apiErrors.request.invalid_status' })
    }
    const actor = await resolveCurrentCommonUser(event, trx)
    if (!actor || !await isActiveGroupMember(trx, String(review.egcs_cn_group), actor.id)) return await forbidden(event)
    const agencyId = getReviewRuntimeOwnerAgencyId(fresh)
    const group = await trx.selectFrom('Common_Group').select('egcs_cn_agency')
      .where('id', '=', String(review.egcs_cn_group)).where('_deleted', '=', false).executeTakeFirst()
    if (!agencyId || !group || String(group.egcs_cn_agency) !== agencyId) return await forbidden(event)
    const eligible = await resolveAgencyValidEntityAssigneeIdsWithDb(trx, 'commonreview', id, [actor.id])
    if (!eligible.has(actor.id)) return await forbidden(event)
    const assignments = await trx.selectFrom('Common_Entity_Assignment')
      .select(['id', 'egcs_cn_user']).where('egcs_cn_entitytype', '=', 'commonreview')
      .where('egcs_cn_entityid', '=', id).where('_deleted', '=', false).orderBy('id').forUpdate().execute()
    if (!assignments.some(item => String(item.egcs_cn_user) === actor.id)) {
      await trx.insertInto('Common_Entity_Assignment').values({
        egcs_cn_entitytype: 'commonreview', egcs_cn_entityid: id,
        egcs_cn_user: actor.id, egcs_cn_isprimary: assignments.length === 0,
        egcs_cn_createdby: actor.id
      }).execute()
    }
    await trx.updateTable('Common_Review').set({ egcs_cn_groupclaimedby: actor.id }).where('id', '=', id).execute()
    return { id, egcs_cn_group: String(review.egcs_cn_group), egcs_cn_groupclaimedby: actor.id }
  })
})
