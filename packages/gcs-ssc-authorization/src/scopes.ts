/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Scope helpers are intentionally small pure policy functions. */
export type GlobalScope = { type: 'global' }
export type AgencyScope = { type: 'agency'; agencyId: string }
export type ProgramScope = { type: 'program'; agencyId: string; transferPaymentId: string }
export type EntityScope = {
  type: 'entity'
  agencyId: string
  path: Array<{ type: string; id: string }>
}

export type RoleScope = GlobalScope | AgencyScope | ProgramScope
export type AuthorizationScope = RoleScope | EntityScope

const isEntityPathCovered = (grant: EntityScope, required: EntityScope): boolean => {
  if (String(grant.agencyId) !== String(required.agencyId)) return false
  if (grant.path.length > required.path.length) return false

  return grant.path.every((grantNode, index) => {
    const requiredNode = required.path[index]
    if (!requiredNode) return false
    return grantNode.type === requiredNode.type
      && String(grantNode.id) === String(requiredNode.id)
  })
}

const programScopeCovers = (
  grant: ProgramScope,
  required: AuthorizationScope
): boolean => {
  if (required.type === 'program') {
    return String(grant.agencyId) === String(required.agencyId)
      && String(grant.transferPaymentId) === String(required.transferPaymentId)
  }
  if (required.type !== 'entity') return false
  if (String(grant.agencyId) !== String(required.agencyId)) return false

  const program = required.path[0]
  return program?.type === 'transfer_payment'
    && String(program.id) === String(grant.transferPaymentId)
}

/** Returns whether a granted hierarchical scope contains a required scope. */
export const isAuthorizationScopeCovered = (
  grant: AuthorizationScope,
  required: AuthorizationScope
): boolean => {
  if (grant.type === 'global') return true

  if (grant.type === 'agency') {
    if (required.type === 'global') return false
    return String(grant.agencyId) === String(required.agencyId)
  }

  if (grant.type === 'program') return programScopeCovers(grant, required)
  if (required.type !== 'entity') return false
  return isEntityPathCovered(grant, required)
}
