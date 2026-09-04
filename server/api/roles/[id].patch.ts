import { sql } from 'kysely'
import { parseI18n, readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { RoleIdSchema, RoleProfilePatchSchema } from '~~/shared/types/schemas/rbac'
import { authorize, authorizeFresh, requireAuthContext, resolveRoleScope } from '~~/server/utils/authorize'
import { recordSecurityAuditEvent } from '~~/server/utils/security-audit'
import {
  getActiveRoleTransferPaymentIds,
  lockRoleParentRows,
  normalizeRoleTransferPaymentIds,
  rejectInvalidRoleScopePermissions,
  resolveRoleScopeInput,
  validateRoleTransferPaymentScope
} from '~~/server/utils/role-routes'

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const idParam = getRouterParam(event, 'id')
  if (!idParam) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const id = await parseI18n(event, RoleIdSchema, idParam)

  await authorize(event, 'role', 'update', resolveRoleScope(id, db))
  const body = await readValidatedBodyI18n(event, RoleProfilePatchSchema)
  const { transfer_payment_ids, ...roleData } = body

  return await db.transaction().execute(async trx => {
    const authorization = await authorizeFresh(
      event,
      'role',
      'update',
      resolveRoleScope(id, trx),
      trx,
      { lockRoleIds: [id] }
    )
    const role = authorization.data
    if (!role) return await notFound(event, 'ROLE_NOT_FOUND', 'apiErrors.role.not_found')

    const roleAgencyId = role.agency_id == null ? undefined : String(role.agency_id)
    const currentTransferPaymentIds = await getActiveRoleTransferPaymentIds(trx, id)
    const transferPaymentIds = transfer_payment_ids === undefined
      ? currentTransferPaymentIds
      : normalizeRoleTransferPaymentIds(transfer_payment_ids)

    await lockRoleParentRows(trx, {
      agencyId: roleAgencyId,
      transferPaymentIds: [...new Set([...currentTransferPaymentIds, ...transferPaymentIds])]
    })

    const transferPaymentScopeError = await validateRoleTransferPaymentScope(
      event,
      trx,
      roleAgencyId,
      transferPaymentIds
    )
    if (transferPaymentScopeError) return transferPaymentScopeError

    const { roleScopeType } = resolveRoleScopeInput(roleAgencyId, transferPaymentIds)
    const persistedAbilities = await trx
      .selectFrom('role_permission')
      .where('role_id', '=', id)
      .where('_deleted', '=', false)
      .select(['subject', 'access_level', 'can_manage_assignments'])
      .execute()
    const abilityError = await rejectInvalidRoleScopePermissions(event, persistedAbilities, roleScopeType)
    if (abilityError) return abilityError

    await trx
      .updateTable('role')
      .set({
        name_en: roleData.name_en,
        name_fr: roleData.name_fr,
        description_en: roleData.description_en === null ? sql<string>`NULL` : roleData.description_en,
        description_fr: roleData.description_fr === null ? sql<string>`NULL` : roleData.description_fr
      })
      .where('id', '=', id)
      .where('_deleted', '=', false)
      .execute()

    if (transfer_payment_ids !== undefined) {
      await trx
        .updateTable('role_transfer_payment_scope')
        .set({ _deleted: true })
        .where('role_id', '=', id)
        .where('_deleted', '=', false)
        .execute()

      if (transferPaymentIds.length > 0) {
        await trx
          .insertInto('role_transfer_payment_scope')
          .values(transferPaymentIds.map(transferPaymentId => ({
            role_id: id,
            transfer_payment_profile_id: transferPaymentId,
            _deleted: false
          })))
          .execute()
      }
    }

    await recordSecurityAuditEvent(trx, {
      actorUserId: authorization.userId,
      eventType: 'role.profile_updated',
      targetType: 'role',
      targetId: id,
      metadata: { transfer_payment_scope_changed: transfer_payment_ids !== undefined }
    })

    return { id }
  })
})
