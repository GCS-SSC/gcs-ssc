import { RoleIdSchema, RolePermissionMutationSchema } from '~~/shared/types/schemas/rbac'
import { parseI18n, readValidatedBodyI18n } from '~~/server/utils/api-validate'
import {
  authorize,
  authorizeWithFreshAuthContext,
  requireAuthContext,
  requireFreshAuthContext,
  resolveRoleScope
} from '~~/server/utils/authorize'
import { rejectInvalidRoleScopePermissions, setRolePermission } from '~~/server/utils/role-routes'
import { getActiveStructuralRoles } from '~~/server/utils/active-user-scopes'
import { recordSecurityAuditEvent } from '~~/server/utils/security-audit'
import { isRoleAbilitySubject } from '@gcs-ssc/authorization'

/** Replaces one subject permission atomically without accepting stale profile fields. */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const idParam = getRouterParam(event, 'id')
  if (!idParam) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  await requireAuthContext(event)
  const id = await parseI18n(event, RoleIdSchema, idParam)
  await authorize(event, 'role', 'update', resolveRoleScope(id, db))
  const { subject, permission } = await readValidatedBodyI18n(event, RolePermissionMutationSchema)

  return await db.transaction().execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx, { lockRoleIds: [id] })
    const role = await trx.selectFrom('role').where('id', '=', id).where('_deleted', '=', false)
      .select(['id', 'agency_id']).executeTakeFirst()
    if (!role) return await notFound(event, 'ROLE_NOT_FOUND', 'apiErrors.role.not_found')
    await authorizeWithFreshAuthContext(event, authContext, 'role', 'update', resolveRoleScope(id, trx))
    const [structuralRole] = await getActiveStructuralRoles(trx, [id])
    if (!structuralRole) return await notFound(event, 'ROLE_NOT_FOUND', 'apiErrors.role.not_found')
    if (permission) {
      const permissionError = await rejectInvalidRoleScopePermissions(event, [permission], structuralRole.scopeType)
      if (permissionError) return permissionError
    }

    if (!isRoleAbilitySubject(subject) || (permission !== null && permission.subject !== subject)) {
      return await badRequest(event, 'INVALID_ROLE_PERMISSION', 'apiErrors.role.scope_ability_mismatch')
    }
    await setRolePermission(trx, id, subject, permission)
    await recordSecurityAuditEvent(trx, {
      actorUserId: authContext.userId,
      eventType: 'role.permission_updated',
      targetType: 'role',
      targetId: id,
      metadata: {
        subject,
        access_level: permission?.access_level ?? null,
        can_manage_assignments: permission?.can_manage_assignments ?? false
      }
    })
    return { id }
  })
})
