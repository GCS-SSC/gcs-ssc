/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Decision inputs and outputs are expressed by discriminated unions. */
import type { AuthorizationAction } from './actions'
import type { AuthorizationSubject } from './abilities'
import type { UserAbilities } from './grants'
import type { AuthorizationScope } from './scopes'

export type AuthorizationResolution<T = undefined> =
  | { denied: true; data?: T }
  | { bypass: true; data?: T }
  | { scope: AuthorizationScope; data?: T }
  | { scopes: AuthorizationScope[]; data?: T }
  | { agencyIds: string[]; hasGlobalAccess?: boolean }

export type AuthorizationDecision<T = undefined> =
  | { allowed: false }
  | {
    allowed: true
    data?: T
    scope?: AuthorizationScope
    agencyIds?: string[]
    hasGlobalAccess?: boolean
  }

/** Evidence accepted by the canonical exact-runtime read policy. */
export type ExactRuntimeReadEvidence = {
  hasInheritedOwnerRead: boolean
  hasExactItemAssignment: boolean
  hasExactSourceAssignment: boolean
  hasApprovalAssignment: boolean
}

/**
 * Exact assignments never raise the role ceiling. Approval-specific reads remain independent.
 */
export const canReadExactRuntimeItem = (
  evidence: ExactRuntimeReadEvidence
): boolean => evidence.hasInheritedOwnerRead
  || evidence.hasApprovalAssignment

/** Evaluates a resolved authorization request without framework or database concerns. */
export const evaluateAuthorizationResolution = <T>(
  abilities: UserAbilities,
  subject: AuthorizationSubject,
  action: AuthorizationAction,
  resolution: AuthorizationResolution<T>
): AuthorizationDecision<T> => {
  if ('denied' in resolution) return { allowed: false }

  if ('agencyIds' in resolution) {
    if (resolution.agencyIds.length === 0 && !resolution.hasGlobalAccess) {
      return { allowed: false }
    }
    return {
      allowed: true,
      agencyIds: resolution.agencyIds,
      hasGlobalAccess: resolution.hasGlobalAccess
    }
  }

  if ('bypass' in resolution) {
    if (!resolution.bypass) return { allowed: false }
    return { allowed: true, data: resolution.data }
  }

  if ('scopes' in resolution) {
    if (resolution.scopes.length === 0) return { allowed: false }
    const allowed = resolution.scopes.some(scope => abilities.authorize(subject, action, scope))
    if (!allowed) return { allowed: false }
    return { allowed: true, data: resolution.data }
  }

  if (!abilities.authorize(subject, action, resolution.scope)) {
    return { allowed: false }
  }
  return { allowed: true, data: resolution.data, scope: resolution.scope }
}
