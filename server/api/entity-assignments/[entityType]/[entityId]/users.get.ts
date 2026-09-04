import { forbidden, notFound } from '~~/server/utils/api-errors'
import { listAgencyScopedCommonUsers } from '~~/server/utils/additional-reviewer-runtime'
import { canManageEntityAssignments, resolveAgencyValidEntityAssigneeIdsWithDb, resolveEntityAssignmentOwner } from '~~/server/utils/entity-assignment'
import { EntityAssignmentTargetSchema } from '~~/shared/types/schemas'
import { parseI18n } from '~~/server/utils/api-validate'
import type { AssignableEntityType } from '~~/shared/types/database'
import {
  canManageExtensionEntityAssignments,
  resolveExtensionEntityAssignmentOwner,
  resolveExtensionEntityAssignmentRuntime
} from '~~/server/utils/extension-entity-assignment'
import { resolveExtensionEligibleAssigneeIds } from '~~/server/utils/extension-lifecycle-context'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const target = await parseI18n(event, EntityAssignmentTargetSchema, { entityType: getRouterParam(event, 'entityType'), entityId: getRouterParam(event, 'entityId') })
  const extensionRuntime = target.entityType.includes(':')
    ? await resolveExtensionEntityAssignmentRuntime(event, target.entityType, target.entityId)
    : null
  const owner = extensionRuntime
    ? resolveExtensionEntityAssignmentOwner(extensionRuntime)
    : await resolveEntityAssignmentOwner(event.context.$db, target.entityType as AssignableEntityType, target.entityId)
  if (!owner) return await notFound(event, 'ASSIGNMENT_TARGET_NOT_FOUND', 'apiErrors.request.not_found')
  const canManage = extensionRuntime
    ? await canManageExtensionEntityAssignments(event, extensionRuntime)
    : await canManageEntityAssignments(event, target.entityType as AssignableEntityType, target.entityId)
  if (!canManage) return await forbidden(event)
  const users = await listAgencyScopedCommonUsers(event.context.$db, owner.agencyId)
  const eligibleUserIds = extensionRuntime
    ? await resolveExtensionEligibleAssigneeIds(event.context.$db, extensionRuntime, users.map(user => user.id))
    : await resolveAgencyValidEntityAssigneeIdsWithDb(
        event.context.$db, target.entityType as AssignableEntityType, target.entityId, users.map(user => user.id)
      )
  return users.filter(user => eligibleUserIds.has(user.id))
})
