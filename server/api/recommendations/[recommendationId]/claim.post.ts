import { forbidden, notFound, throwApiError } from '~~/server/utils/api-errors'
import { requireAuthContext } from '~~/server/utils/authorize'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { resolveAgencyValidEntityAssigneeIdsWithDb } from '~~/server/utils/entity-assignment'
import { getReviewRuntimeOwnerAgencyId, executeFreshAuthorizedRuntimeGroupClaim, resolveReviewRuntimeEntityFromRecommendation } from '~~/server/utils/review-runtime-access'
import { lockActiveGroupMember } from '~~/server/utils/groups'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const id = getRouterParam(event, 'recommendationId') ?? ''
  if (!isPositivePostgresBigintText(id)) return await notFound(event, 'RECOMMENDATION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const context = await resolveReviewRuntimeEntityFromRecommendation(event.context.$db, id)
  if (!context) return await notFound(event, 'RECOMMENDATION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  return await executeFreshAuthorizedRuntimeGroupClaim(event, context, async (trx, lockedContext) => {
    const fresh = await resolveReviewRuntimeEntityFromRecommendation(trx, id)
    if (!fresh || fresh.entityType !== context.entityType || fresh.entityId !== context.entityId
      || fresh.reviewSetId !== context.reviewSetId) {
      return await throwApiError(event, { statusCode: 409, code: 'RECOMMENDATION_OWNER_CHANGED', key: 'apiErrors.request.invalid_status' })
    }
    const recommendation = await trx.selectFrom('Common_Recommendation')
      .innerJoin('Common_Recommendation_Set', 'Common_Recommendation_Set.id', 'Common_Recommendation.egcs_cn_recommendationset')
      .innerJoin('Common_Runtime_Item as Review_Item', 'Review_Item.id', 'Common_Recommendation.egcs_cn_runtimeitem')
      .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Review_Item.egcs_cn_runtime')
      .innerJoin('Common_Runtime_Item as Set_Item', 'Set_Item.id', 'Common_Recommendation_Set.egcs_cn_runtimeitem')
      .select(['Common_Recommendation.egcs_cn_group', 'Common_Recommendation.egcs_cn_groupclaimedby',
        'Common_Runtime.egcs_cn_state as runtimeState', 'Review_Item.egcs_cn_state as recommendationState', 'Set_Item.egcs_cn_state as setState'])
      .where('Common_Recommendation.id', '=', id).where('Common_Recommendation._deleted', '=', false)
      .where('Common_Recommendation_Set._deleted', '=', false)
      .forUpdate(['Common_Runtime', 'Common_Recommendation', 'Review_Item', 'Set_Item']).executeTakeFirst()
    if (!recommendation) return await notFound(event, 'RECOMMENDATION_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (recommendation.runtimeState !== 'active' || recommendation.recommendationState !== 'active' || recommendation.setState !== 'active') {
      return await throwApiError(event, { statusCode: 409, code: 'ASSIGNMENT_ROSTER_LOCKED', key: 'apiErrors.request.invalid_status' })
    }
    if (!recommendation.egcs_cn_group || recommendation.egcs_cn_groupclaimedby) {
      return await throwApiError(event, { statusCode: 409, code: 'GROUP_WORK_ALREADY_CLAIMED', key: 'apiErrors.request.invalid_status' })
    }
    const actor = await resolveCurrentCommonUser(event, trx)
    if (!actor || !await lockActiveGroupMember(trx, String(recommendation.egcs_cn_group), actor.id)) return await forbidden(event)
    const agencyId = getReviewRuntimeOwnerAgencyId(lockedContext)
    const group = await trx.selectFrom('Common_Group').select('egcs_cn_agency')
      .where('id', '=', String(recommendation.egcs_cn_group)).where('_deleted', '=', false).executeTakeFirst()
    if (!agencyId || !group || String(group.egcs_cn_agency) !== agencyId) return await forbidden(event)
    const eligible = await resolveAgencyValidEntityAssigneeIdsWithDb(trx, 'commonrecommendation', id, [actor.id])
    if (!eligible.has(actor.id)) return await forbidden(event)
    const assignments = await trx.selectFrom('Common_Entity_Assignment')
      .select(['id', 'egcs_cn_user']).where('egcs_cn_entitytype', '=', 'commonrecommendation')
      .where('egcs_cn_entityid', '=', id).where('_deleted', '=', false).orderBy('id').forUpdate().execute()
    if (!assignments.some(item => String(item.egcs_cn_user) === actor.id)) {
      await trx.insertInto('Common_Entity_Assignment').values({
        egcs_cn_entitytype: 'commonrecommendation', egcs_cn_entityid: id,
        egcs_cn_user: actor.id, egcs_cn_isprimary: assignments.length === 0,
        egcs_cn_createdby: actor.id
      }).execute()
    }
    await trx.updateTable('Common_Recommendation').set({ egcs_cn_groupclaimedby: actor.id }).where('id', '=', id).execute()
    return { id, egcs_cn_group: String(recommendation.egcs_cn_group), egcs_cn_groupclaimedby: actor.id }
  })
})
