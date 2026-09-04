/* eslint-disable jsdoc/require-jsdoc -- Grant types and evaluator methods are documented by their explicit authorization vocabulary. */
import type { AuthorizationAction, StaticGrantAction } from './actions'
import type { AuthorizationSubject, RoleAbilitySubject } from './abilities'
import { isRoleAbility, ROLE_PERMISSION_SUBJECTS } from './abilities'
import { canSubjectManageAssignments, isAbilityAllowedForRoleScope } from './role-scopes'
import type { AuthorizationScope, RoleScope } from './scopes'
import { isAuthorizationScopeCovered } from './scopes'

export type StaticAuthorizationGrantSource = 'role'

export type StaticAuthorizationGrant = {
  source: StaticAuthorizationGrantSource
  action: StaticGrantAction
  subject: AuthorizationSubject
  scope: RoleScope
}

export type StaticAuthorizationGrantInput = {
  source: StaticAuthorizationGrantSource
  action: StaticGrantAction
  subject: AuthorizationSubject
  scope: AuthorizationScope
}

const normalizeStaticGrant = (
  grant: StaticAuthorizationGrantInput
): StaticAuthorizationGrant | null => {
  if (grant.source !== 'role') return null
  if (grant.scope.type === 'entity') return null

  if (grant.action === 'manage_assignments' && !canSubjectManageAssignments(grant.subject)) return null
  if (grant.action !== 'manage_assignments' && !isRoleAbility(grant)) return null
  if (!isAbilityAllowedForRoleScope(grant.subject, grant.scope.type)) return null
  return { ...grant, scope: grant.scope }
}

const buildScopeKey = (scope: RoleScope): string => {
  if (scope.type === 'global') return 'global'
  if (scope.type === 'agency') return `agency:${scope.agencyId}`
  return `program:${scope.agencyId}:${scope.transferPaymentId}`
}

export const buildStaticGrantKey = (grant: StaticAuthorizationGrant): string => {
  return `${grant.source}:${grant.action}:${grant.subject}:${buildScopeKey(grant.scope)}`
}

/** Canonical evaluator for expanded role grants and independent roster-management grants. */
export class UserAbilities {
  private readonly grants: StaticAuthorizationGrant[]

  constructor(grants: ReadonlyArray<StaticAuthorizationGrantInput>) {
    const normalized = new Map<string, StaticAuthorizationGrant>()
    for (const grant of grants) {
      const candidate = normalizeStaticGrant(grant)
      if (!candidate) continue
      normalized.set(buildStaticGrantKey(candidate), candidate)
    }
    this.grants = [...normalized.values()]
  }

  getGrants(): StaticAuthorizationGrant[] {
    return this.grants
      .map(grant => ({ ...grant, scope: { ...grant.scope } }))
      .sort((left, right) => buildStaticGrantKey(left).localeCompare(buildStaticGrantKey(right)))
  }

  canManageAssignments(subject: AuthorizationSubject, requiredScope: AuthorizationScope): boolean {
    return this.grants.some(grant => grant.subject === subject
      && grant.action === 'manage_assignments'
      && isAuthorizationScopeCovered(grant.scope, requiredScope))
  }

  authorize(
    subject: AuthorizationSubject,
    action: AuthorizationAction,
    requiredScope: AuthorizationScope
  ): boolean {
    return this.grants.some(grant => {
      return grant.subject === subject
        && grant.action === action
        && isAuthorizationScopeCovered(grant.scope, requiredScope)
    })
  }
}

export type ExactAuthorizationGrantSource = 'assignment' | 'approval'

export type ExactEntityTarget<EntityType extends string = string> = {
  entityType: EntityType
  entityId: string
}

export type ExactEntityGrant<EntityType extends string = string> = {
  source: ExactAuthorizationGrantSource
  entityType: EntityType
  entityId: string
  actions: ReadonlySet<AuthorizationAction>
}

export const exactEntityGrantAllows = <EntityType extends string>(
  grant: ExactEntityGrant<EntityType>,
  entityType: EntityType,
  entityId: string,
  action: AuthorizationAction
): boolean => grant.entityType === entityType
  && String(grant.entityId) === String(entityId)
  && grant.actions.has(action)

export const isRoleGrantSubject = (
  subject: AuthorizationSubject
): subject is RoleAbilitySubject => ROLE_PERMISSION_SUBJECTS.includes(subject)
