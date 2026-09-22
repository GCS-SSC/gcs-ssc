import { forbidden, notFound, throwApiError } from '~~/server/utils/api-errors'
import { requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { resolveCurrentCommonUser, listAgencyScopedCommonUsers } from '~~/server/utils/additional-reviewer-runtime'
import { resolveApprovalActionContext } from '~~/server/utils/review-approval-runtime'
import { resolveApprovalRuntimeAgencyProjection } from '~~/server/utils/approval-runtime'
import { isActiveGroupMember } from '~~/server/utils/groups'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const id = getRouterParam(event, 'approvalId') ?? ''
  if (!isPositivePostgresBigintText(id)) return await notFound(event, 'APPROVAL_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const context = await resolveApprovalActionContext(event.context.$db, id)
  if (!context) return await notFound(event, 'APPROVAL_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const projected = await resolveApprovalRuntimeAgencyProjection(event, context.runtimeEntity)
  if (!projected?.schemaAgencyId) return await forbidden(event)
  return await event.context.$db.transaction().execute(async trx => {
    await requireFreshAuthContext(event, trx)
    const approval = await trx.selectFrom('Common_Approval')
      .innerJoin('Common_Runtime_Item as Step_Item', 'Step_Item.id', 'Common_Approval.egcs_cn_runtimeitem')
      .innerJoin('Common_Routing_Slip', 'Common_Routing_Slip.id', 'Common_Approval.egcs_cn_routingslip')
      .innerJoin('Common_Runtime_Item as Routing_Item', 'Routing_Item.id', 'Common_Routing_Slip.egcs_cn_runtimeitem')
      .select(['Common_Approval.egcs_cn_assignedgroup', 'Common_Approval.egcs_cn_assigneduser',
        'Common_Approval.egcs_cn_approvalvalue', 'Step_Item.egcs_cn_state as stepState',
        'Routing_Item.egcs_cn_state as routingState'])
      .where('Common_Approval.id', '=', id).where('Common_Routing_Slip._deleted', '=', false)
      .forUpdate(['Routing_Item', 'Step_Item', 'Common_Approval']).executeTakeFirst()
    if (!approval) return await notFound(event, 'APPROVAL_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (!approval.egcs_cn_assignedgroup || approval.egcs_cn_assigneduser
      || approval.egcs_cn_approvalvalue !== null || approval.stepState !== 'awaiting_action'
      || approval.routingState !== 'awaiting_action') {
      return await throwApiError(event, { statusCode: 409, code: 'GROUP_WORK_ALREADY_CLAIMED', key: 'apiErrors.request.invalid_status' })
    }
    const freshContext = await resolveApprovalActionContext(trx, id)
    if (!freshContext || freshContext.runtimeEntity.entityType !== context.runtimeEntity.entityType
      || freshContext.runtimeEntity.entityId !== context.runtimeEntity.entityId) return await forbidden(event)
    const actor = await resolveCurrentCommonUser(event, trx)
    if (!actor || !await isActiveGroupMember(trx, String(approval.egcs_cn_assignedgroup), actor.id)) return await forbidden(event)
    const group = await trx.selectFrom('Common_Group').select('egcs_cn_agency')
      .where('id', '=', String(approval.egcs_cn_assignedgroup)).where('_deleted', '=', false).executeTakeFirst()
    if (!group || String(group.egcs_cn_agency) !== projected.schemaAgencyId) return await forbidden(event)
    const agencyUsers = await listAgencyScopedCommonUsers(trx, projected.schemaAgencyId)
    if (!agencyUsers.some(user => user.id === actor.id)) return await forbidden(event)
    const claimed = await trx.updateTable('Common_Approval').set({ egcs_cn_assigneduser: actor.id })
      .where('id', '=', id).where('egcs_cn_assigneduser', 'is', null)
      .returning('id').executeTakeFirst()
    if (!claimed) return await throwApiError(event, { statusCode: 409, code: 'GROUP_WORK_ALREADY_CLAIMED', key: 'apiErrors.request.invalid_status' })
    return { id, egcs_cn_assigneduser: actor.id, egcs_cn_assignedgroup: String(approval.egcs_cn_assignedgroup) }
  })
})
