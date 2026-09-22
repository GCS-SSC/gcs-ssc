import { forbidden, notFound, throwApiError } from '~~/server/utils/api-errors'
import { requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { resolveAdditionalReviewerRowContext, resolveCurrentCommonUser, listAgencyScopedCommonUsers } from '~~/server/utils/additional-reviewer-runtime'
import { getReviewRuntimeOwnerAgencyId, lockReviewRuntimeTarget } from '~~/server/utils/review-runtime-access'
import { assertReviewNotLocked } from '~~/server/utils/review-runtime-state'
import { isActiveGroupMember } from '~~/server/utils/groups'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const id = getRouterParam(event, 'additionalReviewerId') ?? ''
  if (!isPositivePostgresBigintText(id)) return await notFound(event, 'ADDITIONAL_REVIEWER_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const context = await resolveAdditionalReviewerRowContext(event.context.$db, id)
  if (!context) return await notFound(event, 'ADDITIONAL_REVIEWER_NOT_FOUND', 'apiErrors.admin_common.not_found')
  return await event.context.$db.transaction().execute(async trx => {
    await requireFreshAuthContext(event, trx)
    await lockReviewRuntimeTarget(trx, context.runtimeEntity)
    const current = await resolveAdditionalReviewerRowContext(trx, id)
    if (!current) return await notFound(event, 'ADDITIONAL_REVIEWER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (current.runtimeEntity.entityType !== context.runtimeEntity.entityType
      || current.runtimeEntity.entityId !== context.runtimeEntity.entityId) return await forbidden(event)
    await assertReviewNotLocked(event, current.reviewRuntimeState, current.reviewSetRuntimeState)
    if (!current.row.assignedGroupId || current.row.assignedUserId || current.row.completedAt) {
      return await throwApiError(event, { statusCode: 409, code: 'GROUP_WORK_ALREADY_CLAIMED', key: 'apiErrors.request.invalid_status' })
    }
    const actor = await resolveCurrentCommonUser(event, trx)
    if (!actor || !await isActiveGroupMember(trx, current.row.assignedGroupId, actor.id)) return await forbidden(event)
    const agencyId = getReviewRuntimeOwnerAgencyId(current.runtimeEntity)
    const group = await trx.selectFrom('Common_Group').select('egcs_cn_agency')
      .where('id', '=', current.row.assignedGroupId).where('_deleted', '=', false).executeTakeFirst()
    if (!agencyId || !group || String(group.egcs_cn_agency) !== agencyId) return await forbidden(event)
    const eligible = await listAgencyScopedCommonUsers(trx, agencyId)
    if (!eligible.some(user => user.id === actor.id)) return await forbidden(event)
    const updated = await trx.updateTable('Common_Additional_Reviewers').set({ egcs_cn_user: actor.id })
      .where('id', '=', id).where('egcs_cn_user', 'is', null).where('_deleted', '=', false)
      .returning('id').executeTakeFirst()
    if (!updated) return await throwApiError(event, { statusCode: 409, code: 'GROUP_WORK_ALREADY_CLAIMED', key: 'apiErrors.request.invalid_status' })
    return { id, egcs_cn_user: actor.id, egcs_cn_group: current.row.assignedGroupId }
  })
})
