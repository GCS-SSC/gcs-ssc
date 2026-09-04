import { authorize, authorizeFresh, requireAuthContext } from '~~/server/utils/authorize'
import { lockRoleParentRows } from '~~/server/utils/role-routes'
import { getActiveStructuralRoles } from '~~/server/utils/active-user-scopes'
import {
  fetchActiveUserRoleAssignmentRole,
  hasSameUserRoleAssignmentRoleContext,
  resolveUserRoleAssignmentRoleContext
} from '~~/server/utils/user-role-assignment-routes'
import { recordSecurityAuditEvent } from '~~/server/utils/security-audit'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const userId = getRouterParam(event, 'id')
  const assignmentId = getRouterParam(event, 'assignmentId')

  if (!userId || !assignmentId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  await requireAuthContext(event)
  if (!isPositivePostgresBigintText(userId) || !isPositivePostgresBigintText(assignmentId)) {
    return await notFound(event, 'ASSIGNMENT_NOT_FOUND', 'apiErrors.user.assignment_not_found')
  }

  const authorization = await authorize(event, 'user', 'update', async ({ context }) => {
    const assignment = await db
      .selectFrom('user_role_assignment')
      .innerJoin('role', 'role.id', 'user_role_assignment.role_id')
      .where('user_role_assignment.id', '=', assignmentId)
      .where('user_role_assignment.user_id', '=', userId)
      .where('user_role_assignment._deleted', '=', false)
      .where('role._deleted', '=', false)
      .select(['user_role_assignment.role_id as role_id', 'role.agency_id as agency_id'])
      .executeTakeFirst()
    if (!assignment) {
      return await notFound(event, 'ASSIGNMENT_NOT_FOUND', 'apiErrors.user.assignment_not_found')
    }
    const preliminaryScope = assignment.agency_id == null
      ? { type: 'global' as const }
      : { type: 'agency' as const, agencyId: String(assignment.agency_id) }
    if (!context.userAbilities.authorize('user', 'update', preliminaryScope)) {
      return await notFound(event, 'ASSIGNMENT_NOT_FOUND', 'apiErrors.user.assignment_not_found')
    }
    const [structuralRole] = await getActiveStructuralRoles(db, [String(assignment.role_id)])
    if (!structuralRole) return await notFound(event, 'ROLE_NOT_FOUND', 'apiErrors.role.not_found')
    if (structuralRole.scopeType !== 'global' && !structuralRole.agencyId) {
      return await badRequest(event, 'MISSING_AGENCY_ID', 'apiErrors.request.missing_agency_id')
    }
    const initialRoleContext = {
      agencyId: structuralRole.agencyId ?? undefined,
      authorizationScope: structuralRole.scopeType === 'global'
        ? { type: 'global' as const }
        : { type: 'agency' as const, agencyId: structuralRole.agencyId! },
      transferPaymentIds: structuralRole.transferPaymentIds
    }
    return { scope: initialRoleContext.authorizationScope, data: { assignment, initialRoleContext } }
  })
  if (!authorization.data) return authorization
  const { assignment, initialRoleContext } = authorization.data!

  return await db.transaction().execute(async trx => {
    const authContext = await authorizeFresh(
      event,
      'user',
      'update',
      initialRoleContext.authorizationScope,
      trx,
      {
        lockRoleIds: [String(assignment.role_id)],
        lockUserIds: [userId]
      }
    )
    await lockRoleParentRows(trx, {
      agencyId: initialRoleContext.agencyId,
      transferPaymentIds: initialRoleContext.transferPaymentIds
    })

    const lockedRole = await fetchActiveUserRoleAssignmentRole(
      event,
      trx,
      String(assignment.role_id)
    )
    if ('statusCode' in lockedRole) return lockedRole
    const lockedRoleContext = await resolveUserRoleAssignmentRoleContext(event, trx, lockedRole)
    if ('statusCode' in lockedRoleContext) return lockedRoleContext
    if (!hasSameUserRoleAssignmentRoleContext(initialRoleContext, lockedRoleContext)) {
      return await badRequest(event, 'ROLE_SCOPE_DATA_CONFLICT', 'apiErrors.role.scope_data_conflict')
    }

    const lockedAssignment = await trx
      .selectFrom('user_role_assignment')
      .where('id', '=', assignmentId)
      .where('user_id', '=', userId)
      .where('role_id', '=', assignment.role_id)
      .where('_deleted', '=', false)
      .select('id')
      .forUpdate()
      .executeTakeFirst()
    if (!lockedAssignment) {
      return await notFound(event, 'ASSIGNMENT_NOT_FOUND', 'apiErrors.user.assignment_not_found')
    }

    await trx
      .updateTable('user_role_assignment')
      .set({ _deleted: true })
      .where('id', '=', assignmentId)
      .where('user_id', '=', userId)
      .where('_deleted', '=', false)
      .execute()

    await recordSecurityAuditEvent(trx, {
      actorUserId: authContext.userId,
      eventType: 'user.role_assignment_deleted',
      targetType: 'user_role_assignment',
      targetId: assignmentId,
      metadata: { user_id: userId, role_id: String(assignment.role_id) }
    })

    return { success: true }
  })
})
