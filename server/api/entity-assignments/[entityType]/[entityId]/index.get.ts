import { forbidden } from '~~/server/utils/api-errors'
import { canManageEntityAssignments, canReadEntityAssignments, resolveAgencyValidEntityAssigneeIdsWithDb, resolveAssignmentActor } from '~~/server/utils/entity-assignment'
import { EntityAssignmentTargetSchema } from '~~/shared/types/schemas'
import { parseI18n } from '~~/server/utils/api-validate'
import type { AssignableEntityType } from '~~/shared/types/database'
import {
  authorizeExtensionEntityAssignmentRead,
  canManageExtensionEntityAssignments,
  resolveExtensionEntityAssignmentRuntime
} from '~~/server/utils/extension-entity-assignment'
import { resolveExtensionEligibleAssigneeIds } from '~~/server/utils/extension-lifecycle-context'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const target = await parseI18n(event, EntityAssignmentTargetSchema, {
    entityType: getRouterParam(event, 'entityType'), entityId: getRouterParam(event, 'entityId')
  })
  const extensionRuntime = target.entityType.includes(':')
    ? await resolveExtensionEntityAssignmentRuntime(event, target.entityType, target.entityId)
    : null
  if (target.entityType.includes(':') && !extensionRuntime) return await forbidden(event)
  if (extensionRuntime) await authorizeExtensionEntityAssignmentRead(event, extensionRuntime)
  else if (!await canReadEntityAssignments(event, target.entityType as AssignableEntityType, target.entityId)) return await forbidden(event)
  const actor = await resolveAssignmentActor(event)
  const assignments = await event.context.$db.selectFrom('Common_Entity_Assignment')
    .innerJoin('Common_User', 'Common_User.id', 'Common_Entity_Assignment.egcs_cn_user')
    .select(['Common_Entity_Assignment.id', 'Common_Entity_Assignment.egcs_cn_user as user_id', 'Common_Entity_Assignment.egcs_cn_isprimary as is_primary', 'Common_Entity_Assignment.egcs_cn_createdat as created_at', 'Common_User.egcs_cn_name as name', 'Common_User.egcs_cn_email as email', 'Common_User._deleted as is_inactive'])
    .where('Common_Entity_Assignment.egcs_cn_entitytype', '=', target.entityType)
    .where('Common_Entity_Assignment.egcs_cn_entityid', '=', target.entityId)
    .where('Common_Entity_Assignment._deleted', '=', false)
    .orderBy('Common_Entity_Assignment.egcs_cn_isprimary', 'desc').orderBy('Common_User.egcs_cn_name').execute()
  const assignmentUserIds = assignments.filter(row => !row.is_inactive).map(row => String(row.user_id))
  const eligibleUserIds = extensionRuntime
    ? await resolveExtensionEligibleAssigneeIds(event.context.$db, extensionRuntime, assignmentUserIds)
    : await resolveAgencyValidEntityAssigneeIdsWithDb(
        event.context.$db,
        target.entityType as AssignableEntityType,
        target.entityId,
        assignmentUserIds
      )
  return {
    assignments: assignments.map(row => ({
      ...row,
      is_eligible: !row.is_inactive && eligibleUserIds.has(String(row.user_id)),
      is_current_user: String(row.user_id) === actor.commonUserId
    })),
    can_manage_assignments: extensionRuntime
      ? await canManageExtensionEntityAssignments(event, extensionRuntime)
      : await canManageEntityAssignments(event, target.entityType as AssignableEntityType, target.entityId),
    is_assigned: assignments.some(row =>
      String(row.user_id) === actor.commonUserId
      && !row.is_inactive
      && eligibleUserIds.has(String(row.user_id))
    ),
    is_primary: assignments.some(row => String(row.user_id) === actor.commonUserId && row.is_primary)
  }
})
