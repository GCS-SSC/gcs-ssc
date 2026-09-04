import { authorize, authorizeFresh, requireAuthContext, resolveRoleScope } from '~~/server/utils/authorize'
import { parseI18n } from '~~/server/utils/api-validate'
import { recordSecurityAuditEvent } from '~~/server/utils/security-audit'
import { RoleIdSchema } from '~~/shared/types/schemas/rbac'
import {
  getActiveRoleTransferPaymentIds,
  lockRoleParentRows,
  softDeleteRoles
} from '~~/server/utils/role-routes'

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const idParam = getRouterParam(event, 'id')
  if (!idParam) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const id = await parseI18n(event, RoleIdSchema, idParam)

  await authorize(event, 'role', 'delete', resolveRoleScope(id, db))

  return await db.transaction().execute(async trx => {
    const authorization = await authorizeFresh(
      event,
      'role',
      'delete',
      resolveRoleScope(id, trx),
      trx,
      { lockRoleIds: [id] }
    )
    const role = authorization.data
    if (!role) return await notFound(event, 'ROLE_NOT_FOUND', 'apiErrors.role.not_found')
    const agencyId = role.agency_id == null ? undefined : String(role.agency_id)
    const transferPaymentIds = await getActiveRoleTransferPaymentIds(trx, id)
    await lockRoleParentRows(trx, { agencyId, transferPaymentIds })

    await softDeleteRoles(trx, [id])
    await recordSecurityAuditEvent(trx, {
      actorUserId: authorization.userId,
      eventType: 'role.deleted',
      targetType: 'role',
      targetId: id
    })

    return { id }
  })
})
