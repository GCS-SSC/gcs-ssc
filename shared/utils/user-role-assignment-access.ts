/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- exported helper types fully describe the compact predicate */
import type { RoleOptionItem, UserRoleAssignmentAccess } from '../types/admin'
import { getRoleScopeType } from './role-scope'

/** Checks whether assignment access covers a structurally valid role scope. */
export const canAssignUserRole = (
  role: RoleOptionItem,
  access: UserRoleAssignmentAccess
): boolean => {
  const agencyId = role.agency_id ? String(role.agency_id) : null
  const scopeType: unknown = role.scope_type
  if (scopeType !== 'global' && scopeType !== 'agency' && scopeType !== 'program') {
    return false
  }
  if (Array.isArray(role.transfer_payment_ids)) {
    const effectiveScopeType = getRoleScopeType(agencyId, role.transfer_payment_ids.length)
    if (scopeType !== effectiveScopeType) {
      return false
    }
  } else if (
    scopeType === 'global'
      ? agencyId !== null
      : agencyId === null
  ) {
    return false
  }

  if (access.has_global_access) {
    return true
  }

  return agencyId !== null && access.agency_ids.includes(agencyId)
}
