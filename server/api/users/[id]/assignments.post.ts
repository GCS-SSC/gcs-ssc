import { sql } from 'kysely'
import { UserRoleAssignmentSchema } from '~~/shared/types/schemas/rbac'
import { authorize, authorizeFresh, requireAuthContext } from '~~/server/utils/authorize'
import { lockRoleParentRows } from '~~/server/utils/role-routes'
import { getActiveStructuralRoles } from '~~/server/utils/active-user-scopes'
import {
  fetchActiveUserRoleAssignmentRole,
  fetchActiveUserRoleAssignmentUser,
  hasSameUserRoleAssignmentRoleContext,
  resolveUserRoleAssignmentRoleContext
} from '~~/server/utils/user-role-assignment-routes'
import { recordSecurityAuditEvent } from '~~/server/utils/security-audit'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const userId = getRouterParam(event, 'id')
  if (!userId) return await badRequest(event, 'MISSING_USER_ID', 'apiErrors.request.missing_user_id')
  await requireAuthContext(event)
  if (!isPositivePostgresBigintText(userId)) return await notFound(event, 'USER_NOT_FOUND', 'apiErrors.user.not_found')

  const body = await readValidatedBodyI18n(event, UserRoleAssignmentSchema)
  const authorization = await authorize(event, 'user', 'update', async ({ context }) => {
    const initialRole = await db.selectFrom('role').where('id', '=', body.role_id).where('_deleted', '=', false)
      .select(['id', 'agency_id']).executeTakeFirst()
    if (!initialRole) return await notFound(event, 'ROLE_NOT_FOUND', 'apiErrors.role.not_found')
    const preliminaryScope = initialRole.agency_id == null
      ? { type: 'global' as const }
      : { type: 'agency' as const, agencyId: String(initialRole.agency_id) }
    if (!context.userAbilities.authorize('user', 'update', preliminaryScope)) {
      return await notFound(event, 'ROLE_NOT_FOUND', 'apiErrors.role.not_found')
    }
    const [structuralRole] = await getActiveStructuralRoles(db, [body.role_id])
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
    return { scope: initialRoleContext.authorizationScope, data: initialRoleContext }
  })
  if (!authorization.data) return authorization
  const initialRoleContext = authorization.data

  return await db.transaction().execute(async trx => {
    const authContext = await authorizeFresh(
      event,
      'user',
      'update',
      initialRoleContext.authorizationScope,
      trx,
      {
        lockRoleIds: [body.role_id],
        lockUserIds: [userId]
      }
    )
    await lockRoleParentRows(trx, {
      agencyId: initialRoleContext.agencyId,
      transferPaymentIds: initialRoleContext.transferPaymentIds
    })

    const missingUser = await fetchActiveUserRoleAssignmentUser(event, trx, userId)
    if (missingUser) return missingUser

    const lockedRole = await fetchActiveUserRoleAssignmentRole(event, trx, body.role_id)
    if ('statusCode' in lockedRole) return lockedRole
    const lockedRoleContext = await resolveUserRoleAssignmentRoleContext(event, trx, lockedRole)
    if ('statusCode' in lockedRoleContext) return lockedRoleContext
    if (!hasSameUserRoleAssignmentRoleContext(initialRoleContext, lockedRoleContext)) {
      return await badRequest(event, 'ROLE_SCOPE_DATA_CONFLICT', 'apiErrors.role.scope_data_conflict')
    }

    const existing = await trx
      .selectFrom('user_role_assignment')
      .where('user_id', '=', userId)
      .where('role_id', '=', body.role_id)
      .where('_deleted', '=', false)
      .select('id')
      .forUpdate()
      .executeTakeFirst()

    if (existing) {
      return { id: String(existing.id) }
    }

    const created = await trx
      .insertInto('user_role_assignment')
      .values({
        user_id: userId,
        role_id: body.role_id,
        createdAt: new Date(),
        _deleted: false
      })
      .onConflict(conflict => conflict
        .columns(['user_id', 'role_id'])
        .where(sql<boolean>`_deleted = false`)
        .doNothing())
      .returning('id')
      .executeTakeFirst()

    if (!created) {
      const concurrentAssignment = await trx
        .selectFrom('user_role_assignment')
        .where('user_id', '=', userId)
        .where('role_id', '=', body.role_id)
        .where('_deleted', '=', false)
        .select('id')
        .executeTakeFirstOrThrow()

      return { id: String(concurrentAssignment.id) }
    }

    await recordSecurityAuditEvent(trx, {
      actorUserId: authContext.userId,
      eventType: 'user.role_assignment_created',
      targetType: 'user_role_assignment',
      targetId: String(created.id),
      metadata: { user_id: userId, role_id: body.role_id }
    })

    return { id: String(created.id) }
  })
})
