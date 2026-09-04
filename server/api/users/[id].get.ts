import {
  authorize,
  canAuthorizeUserScopes,
  requireAuthContext,
  resolveAuthorizedAgencyAccess,
  resolveUserScopes
} from '~~/server/utils/authorize'
import { getActiveStructuralRoleAssignments } from '~~/server/utils/active-user-scopes'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(id)) return await notFound(event, 'USER_NOT_FOUND', 'apiErrors.user.not_found')

  const authContext = await authorize(event, 'user', 'read', resolveUserScopes(id, db))

  const user = await db
    .selectFrom('user')
    .where('id', '=', id)
    .where('_deleted', '=', false)
    .select(['id', 'name', 'email', 'emailVerified', 'image', 'createdAt', 'updatedAt'])
    .executeTakeFirst()

  if (!user) return await notFound(event, 'USER_NOT_FOUND', 'apiErrors.user.not_found')

  const [assignmentRows, activeAssignments, canUpdate, roleAssignmentAccess] = await Promise.all([
    db
      .selectFrom('user_role_assignment')
      .innerJoin('role', 'role.id', 'user_role_assignment.role_id')
      .leftJoin('Agency_Profile', 'Agency_Profile.id', 'role.agency_id')
      .where('user_role_assignment.user_id', '=', id)
      .where('user_role_assignment._deleted', '=', false)
      .where('role._deleted', '=', false)
      .select([
        'user_role_assignment.id',
        'user_role_assignment.role_id as role_id',
        'role.agency_id as agency_id',
        'role.name_en as role_name_en',
        'role.name_fr as role_name_fr',
        'Agency_Profile.egcs_ay_name_en as agency_name_en',
        'Agency_Profile.egcs_ay_name_fr as agency_name_fr'
      ])
      .execute(),
    getActiveStructuralRoleAssignments(db, [id]),
    canAuthorizeUserScopes(id, db, authContext, 'update'),
    resolveAuthorizedAgencyAccess(authContext, 'user', 'update', db)
  ])
  const activeAssignmentIds = new Set(activeAssignments.map(assignment => assignment.assignmentId))
  const activeAssignmentsById = new Map(
    activeAssignments.map(assignment => [assignment.assignmentId, assignment])
  )
  const structuralAssignmentRows = assignmentRows.filter(assignment => activeAssignmentIds.has(String(assignment.id)))

  const canReadAllAssignments = authContext.userId === id
    || authContext.userAbilities.authorize('user', 'read', { type: 'global' })

  const visibleAssignments = canReadAllAssignments
    ? structuralAssignmentRows
    : structuralAssignmentRows.filter(assignment => {
        const structuralAssignment = activeAssignmentsById.get(String(assignment.id))
        return (structuralAssignment?.scopeType === 'agency' || structuralAssignment?.scopeType === 'program')
          && assignment.agency_id != null
          && authContext.userAbilities.authorize('user', 'read', {
            type: 'agency',
            agencyId: String(assignment.agency_id)
          })
      })

  const assignments = visibleAssignments.map(assignment => ({
    id: assignment.id,
    role_id: assignment.role_id,
    agency_id: assignment.agency_id,
    role_name_en: assignment.role_name_en,
    role_name_fr: assignment.role_name_fr,
    agency_name_en: assignment.agency_name_en,
    agency_name_fr: assignment.agency_name_fr,
    can_delete: roleAssignmentAccess.hasGlobalAccess
      || (
        assignment.agency_id != null
        && roleAssignmentAccess.agencyIds.includes(String(assignment.agency_id))
      )
  }))

  return {
    ...user,
    can_update: canUpdate,
    role_assignment_access: {
      has_global_access: roleAssignmentAccess.hasGlobalAccess,
      agency_ids: roleAssignmentAccess.agencyIds
    },
    assignments
  }
})
