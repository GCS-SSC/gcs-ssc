import { RoleSchema } from '~~/shared/types/schemas/rbac'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorize, authorizeFresh, requireAuthContext } from '~~/server/utils/authorize'
import { recordSecurityAuditEvent } from '~~/server/utils/security-audit'
import {
  normalizeRolePermissions,
  normalizeRoleTransferPaymentIds,
  rejectInvalidRoleScopePermissions,
  resolveRoleScopeInput,
  validateRoleTransferPaymentScope
} from '~~/server/utils/role-routes'

export default defineEventHandler(async event => {
  const db = event.context.$db

  await requireAuthContext(event)
  const body = await readValidatedBodyI18n(event, RoleSchema)
  const { permissions, transfer_payment_ids, ...roleData } = body

  const normalizedPermissions = normalizeRolePermissions(permissions)
  const transferPaymentIds = normalizeRoleTransferPaymentIds(transfer_payment_ids)
  const { roleAgencyId, roleScopeType } = resolveRoleScopeInput(roleData.agency_id, transferPaymentIds)
  const authorizationScope = roleAgencyId
    ? { type: 'agency', agencyId: roleAgencyId } as const
    : { type: 'global' } as const

  await authorize(event, 'role', 'create', authorizationScope)

  const abilityError = await rejectInvalidRoleScopePermissions(event, normalizedPermissions, roleScopeType)
  if (abilityError) return abilityError

  return await db.transaction().execute(async trx => {
    const authContext = await authorizeFresh(event, 'role', 'create', authorizationScope, trx)

    const transferPaymentScopeError = await validateRoleTransferPaymentScope(
      event,
      trx,
      roleAgencyId,
      transferPaymentIds
    )
    if (transferPaymentScopeError) return transferPaymentScopeError

    const createdRole = await trx
      .insertInto('role')
      .values({
        name_en: roleData.name_en,
        name_fr: roleData.name_fr,
        description_en: roleData.description_en ?? undefined,
        description_fr: roleData.description_fr ?? undefined,
        agency_id: roleAgencyId,
        _deleted: false
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    const createdRoleId = String(createdRole.id)

    if (normalizedPermissions.length > 0) {
      await trx
        .insertInto('role_permission')
        .values(
          normalizedPermissions.map(permission => ({
            role_id: createdRoleId,
            subject: permission.subject,
            access_level: permission.access_level,
            can_manage_assignments: permission.can_manage_assignments,
            _deleted: false
          }))
        )
        .execute()
    }

    if (transferPaymentIds.length > 0) {
      await trx
        .insertInto('role_transfer_payment_scope')
        .values(
          transferPaymentIds.map(transferPaymentId => ({
            role_id: createdRoleId,
            transfer_payment_profile_id: transferPaymentId,
            _deleted: false
          }))
        )
        .execute()
    }

    await recordSecurityAuditEvent(trx, {
      actorUserId: authContext.userId,
      eventType: 'role.created',
      targetType: 'role',
      targetId: createdRoleId,
      metadata: { agency_id: roleAgencyId ?? null, transfer_payment_ids: transferPaymentIds }
    })

    return { id: createdRoleId }
  })
})
