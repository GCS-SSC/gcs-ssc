import {
  authorizeWithFreshAuthContext,
  requireAuthContext,
  requireFreshAuthContext,
  resolveRoleScope
} from '~~/server/utils/authorize'
import { parseI18n } from '~~/server/utils/api-validate'
import { RoleIdSchema } from '~~/shared/types/schemas/rbac'
import { getRoleScopeType } from '~~/shared/utils/role-scope'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const idParam = getRouterParam(event, 'id')
  if (!idParam) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const id = await parseI18n(event, RoleIdSchema, idParam)

  return await db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx)
    const { data: role } = await authorizeWithFreshAuthContext(
      event,
      authContext,
      'role',
      'read',
      resolveRoleScope(id, trx)
    )

    const [permissions, transferPaymentScopes] = await Promise.all([
      trx
        .selectFrom('role_permission')
        .where('role_id', '=', id)
        .where('_deleted', '=', false)
        .select(['subject', 'access_level', 'can_manage_assignments'])
        .execute(),
      trx
        .selectFrom('role_transfer_payment_scope')
        .innerJoin('role', 'role.id', 'role_transfer_payment_scope.role_id')
        .innerJoin('Transfer_Payment_Profile', join => join
          .onRef('Transfer_Payment_Profile.id', '=', 'role_transfer_payment_scope.transfer_payment_profile_id')
          .onRef('Transfer_Payment_Profile.egcs_tp_agency', '=', 'role.agency_id')
          .on('Transfer_Payment_Profile._deleted', '=', false))
        .where('role_transfer_payment_scope.role_id', '=', id)
        .where('role_transfer_payment_scope._deleted', '=', false)
        .select('role_transfer_payment_scope.transfer_payment_profile_id')
        .execute()
    ])

    return {
      ...role,
      permissions,
      transfer_payment_ids: transferPaymentScopes.map(scope => String(scope.transfer_payment_profile_id)),
      scope_type: getRoleScopeType(
        role?.agency_id == null ? null : String(role.agency_id),
        transferPaymentScopes.length
      )
    }
  })
})
