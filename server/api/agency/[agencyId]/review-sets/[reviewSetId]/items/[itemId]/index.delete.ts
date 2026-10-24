import { defineEventHandler, getRouterParam } from 'h3'
import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { throwIfReviewSetupMemberConstraintError } from '~~/server/utils/review-setup-member-constraint-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  const reviewSetupId = getRouterParam(event, 'reviewSetId') ?? ''
  const itemId = getRouterParam(event, 'itemId') ?? ''
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  if (!isPositivePostgresBigintText(reviewSetupId) || !isPositivePostgresBigintText(itemId)) return await notFound(event, 'REVIEW_SETUP_MEMBER_NOT_FOUND', 'apiErrors.review.review_set_setup_not_found')
  try {
    return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
      const parent = await trx.selectFrom('Common_Review_Set_Setup')
        .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Review_Set_Setup.id')
        .select(['Common_Review_Set_Setup.id', 'Common_Publication.egcs_cn_state as publicationState'])
        .where('Common_Review_Set_Setup.id', '=', reviewSetupId)
        .where('Common_Review_Set_Setup.egcs_cn_agency', '=', agencyId)
        .where('Common_Review_Set_Setup._deleted', '=', false).forUpdate().executeTakeFirst()
      if (!parent) return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.review.review_set_setup_not_found')
      if (parent.publicationState === 'retired') {
        return await throwApiError(event, {
          statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
        })
      }
      const deleted = await trx.updateTable('Common_Review_Setup').set({ _deleted: true })
        .where('id', '=', itemId).where('egcs_cn_reviewset', '=', reviewSetupId).where('_deleted', '=', false)
        .returning('id').executeTakeFirst()
      if (!deleted) return await notFound(event, 'REVIEW_SETUP_MEMBER_NOT_FOUND', 'apiErrors.review.review_set_setup_not_found')
      const remainingMembers = await trx.selectFrom('Common_Review_Setup').select(['id', 'egcs_cn_order'])
        .where('egcs_cn_reviewset', '=', reviewSetupId).where('_deleted', '=', false)
        .orderBy('egcs_cn_order', 'asc').forUpdate().execute()
      // Large signed-order sets must end at SMALLINT max rather than overflow positive orders.
      const firstOrder = Math.min(1, 32768 - remainingMembers.length)
      // Move down from the start, then up from the end, so occupied orders are freed first.
      for (const [index, member] of remainingMembers.entries()) {
        if (member.egcs_cn_order <= index + firstOrder) continue
        await trx.updateTable('Common_Review_Setup').set({ egcs_cn_order: index + firstOrder })
          .where('id', '=', String(member.id)).execute()
      }
      for (const [index, member] of Array.from(remainingMembers.entries()).reverse()) {
        if (member.egcs_cn_order >= index + firstOrder) continue
        await trx.updateTable('Common_Review_Setup').set({ egcs_cn_order: index + firstOrder })
          .where('id', '=', String(member.id)).execute()
      }
      return { success: true }
    }
    )
  } catch (error: unknown) {
    return await throwIfReviewSetupMemberConstraintError(event, error)
  }
})
