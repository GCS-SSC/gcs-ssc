import { forbidden, notFound, throwApiError } from '~~/server/utils/api-errors'
import { requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import {
  isEntityAssignmentRosterWorkable, resolveAgencyValidEntityAssigneeIdsWithDb,
  resolveAssignmentCommonUserId
} from '~~/server/utils/entity-assignment'
import { resolveFundingCaseScope } from '~~/server/utils/funding-case'
import { isActiveGroupMember } from '~~/server/utils/groups'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const id = getRouterParam(event, 'id') ?? ''
  if (!isPositivePostgresBigintText(id)) return await notFound(event, 'FUNDING_CASE_INTAKE_NOT_FOUND', 'apiErrors.admin_common.not_found')
  return await event.context.$db.transaction().execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    const intake = await trx.selectFrom('Funding_Case_Intake_Profile')
      .select(['id', 'egcs_fi_group', 'egcs_fi_groupclaimedby'])
      .where('id', '=', id).where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!intake) return await notFound(event, 'FUNDING_CASE_INTAKE_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const scope = await resolveFundingCaseScope(trx, id)
    if (!scope || !auth.userAbilities.authorize('funding_case', 'update', scope.scope)) return await forbidden(event)
    if (!await isEntityAssignmentRosterWorkable(trx, 'fundingcaseintake', id)) {
      return await throwApiError(event, { statusCode: 409, code: 'ASSIGNMENT_ROSTER_LOCKED', key: 'apiErrors.request.invalid_status' })
    }
    if (!intake.egcs_fi_group || intake.egcs_fi_groupclaimedby) {
      return await throwApiError(event, { statusCode: 409, code: 'GROUP_WORK_ALREADY_CLAIMED', key: 'apiErrors.request.invalid_status' })
    }
    const actorId = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!actorId || !await isActiveGroupMember(trx, String(intake.egcs_fi_group), actorId)) return await forbidden(event)
    const group = await trx.selectFrom('Common_Group').select('egcs_cn_agency')
      .where('id', '=', String(intake.egcs_fi_group)).where('_deleted', '=', false).executeTakeFirst()
    if (!group || String(group.egcs_cn_agency) !== scope.agencyId) return await forbidden(event)
    const eligible = await resolveAgencyValidEntityAssigneeIdsWithDb(trx, 'fundingcaseintake', id, [actorId])
    if (!eligible.has(actorId)) return await forbidden(event)
    const assignments = await trx.selectFrom('Common_Entity_Assignment')
      .select(['id', 'egcs_cn_user']).where('egcs_cn_entitytype', '=', 'fundingcaseintake')
      .where('egcs_cn_entityid', '=', id).where('_deleted', '=', false).orderBy('id').forUpdate().execute()
    if (!assignments.some(item => String(item.egcs_cn_user) === actorId)) {
      await trx.insertInto('Common_Entity_Assignment').values({
        egcs_cn_entitytype: 'fundingcaseintake', egcs_cn_entityid: id,
        egcs_cn_user: actorId, egcs_cn_isprimary: assignments.length === 0,
        egcs_cn_createdby: actorId
      }).execute()
    }
    await trx.updateTable('Funding_Case_Intake_Profile').set({ egcs_fi_groupclaimedby: actorId })
      .where('id', '=', id).execute()
    return { id, egcs_fi_group: String(intake.egcs_fi_group), egcs_fi_groupclaimedby: actorId }
  })
})
