/* eslint-disable jsdoc/require-jsdoc -- Repository contracts use explicit authorization types. */
import type { Kysely } from 'kysely'
import type { Database } from '../../../../shared/types/database'
import { AUTHORIZATION_ACTIONS, type AuthorizationAction } from '../actions'
import type { AuthorizationSubject } from '../abilities'
import { isRoleAbilitySubject } from '../abilities'
import { canSubjectManageAssignments } from '../role-scopes'
import {
  buildStaticGrantKey,
  type StaticAuthorizationGrant,
  UserAbilities
} from '../grants'
import {
  buildRoleGrantScope,
  isAbilityAllowedForRoleScope,
  type RoleScopeType
} from '../role-scopes'

export type ActiveStructuralRoleAssignment = {
  assignmentId: string
  userId: string
  roleId: string
  scopeType: RoleScopeType
  agencyId: string | null
  transferPaymentId: string | null
}

export type StructuralRoleAssignmentLoader = (
  db: Kysely<Database>,
  userIds: string[]
) => Promise<ActiveStructuralRoleAssignment[]>

type RolePermissionRow = {
  access_level: 'viewer' | 'contributor' | 'manager' | null
  can_manage_assignments: boolean
  subject: AuthorizationSubject
  role_id: string
}

const ACCESS_LEVEL_ACTIONS: Record<NonNullable<RolePermissionRow['access_level']>, readonly AuthorizationAction[]> = {
  viewer: ['read'],
  contributor: ['read', 'create', 'update'],
  manager: AUTHORIZATION_ACTIONS
}

const buildRoleGrant = (
  row: RolePermissionRow,
  assignment: ActiveStructuralRoleAssignment
): StaticAuthorizationGrant[] => {
  if (!isRoleAbilitySubject(row.subject)) return []
  if (!isAbilityAllowedForRoleScope(row.subject, assignment.scopeType)) return []

  const scope = buildRoleGrantScope(
    assignment.scopeType,
    assignment.agencyId,
    assignment.transferPaymentId ?? undefined
  )
  if (!scope) return []
  const grants: StaticAuthorizationGrant[] = (row.access_level ? ACCESS_LEVEL_ACTIONS[row.access_level] ?? [] : [])
    .map(action => ({ source: 'role', action, subject: row.subject, scope }))
  if (row.can_manage_assignments && canSubjectManageAssignments(row.subject)) {
    grants.push({ source: 'role', action: 'manage_assignments', subject: row.subject, scope })
  }
  return grants
}

/** Loads cumulative role permissions and expands them into the static CRUD grant graph. */
export class StaticAuthorizationRepository {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly loadStructuralAssignments: StructuralRoleAssignmentLoader
  ) {}

  async loadUserAbilities(userId: string): Promise<UserAbilities> {
    return (await this.loadUsersAbilities([userId])).get(userId) ?? new UserAbilities([])
  }

  /**
   * Loads static authorization graphs for multiple users without repeating role queries.
   * @param userIds Application-user identifiers to load.
   * @returns One evaluator for every requested identifier, including empty evaluators for inactive users.
   */
  async loadUsersAbilities(userIds: string[]): Promise<Map<string, UserAbilities>> {
    const uniqueUserIds = [...new Set(userIds.map(String))]
    if (uniqueUserIds.length === 0) return new Map()
    const [assignments, users] = await Promise.all([
      this.loadStructuralAssignments(this.db, uniqueUserIds),
      this.db.selectFrom('user').where('id', 'in', uniqueUserIds).where('_deleted', '=', false).select('id').execute()
    ])
    const activeUserIds = new Set(users.map(user => String(user.id)))

    const roleIds = [...new Set(assignments.map(assignment => String(assignment.roleId)))]
    const abilityRows = await this.loadRolePermissions(roleIds)
    const abilitiesByRoleId = new Map<string, RolePermissionRow[]>()
    for (const ability of abilityRows) {
      const roleId = String(ability.role_id)
      const existing = abilitiesByRoleId.get(roleId)
      if (existing) {
        existing.push(ability)
        continue
      }
      abilitiesByRoleId.set(roleId, [ability])
    }

    const grantsByUserId = new Map<string, Map<string, StaticAuthorizationGrant>>()
    for (const assignment of assignments) {
      const userId = String(assignment.userId)
      if (!activeUserIds.has(userId)) continue
      const grants = grantsByUserId.get(userId) ?? new Map<string, StaticAuthorizationGrant>()
      grantsByUserId.set(userId, grants)
      const abilities = abilitiesByRoleId.get(String(assignment.roleId)) ?? []
      for (const ability of abilities) {
        for (const grant of buildRoleGrant(ability, assignment)) {
          grants.set(buildStaticGrantKey(grant), grant)
        }
      }
    }
    return new Map(uniqueUserIds.map(userId => [
      userId,
      new UserAbilities(activeUserIds.has(userId) ? [...(grantsByUserId.get(userId)?.values() ?? [])] : [])
    ]))
  }

  async listAssignedAgencyIds(userId: string): Promise<string[]> {
    const assignments = await this.loadStructuralAssignments(this.db, [userId])
    const agencyIds = new Set<string>()
    for (const assignment of assignments) {
      if (assignment.scopeType === 'global') continue
      if (assignment.agencyId) agencyIds.add(assignment.agencyId)
    }
    return [...agencyIds]
  }

  private async loadRolePermissions(roleIds: string[]): Promise<RolePermissionRow[]> {
    if (roleIds.length === 0) return []
    return await this.db.selectFrom('role_permission')
      .where('role_id', 'in', roleIds)
      .where('_deleted', '=', false)
      .select(['role_id', 'subject', 'access_level', 'can_manage_assignments'])
      .execute()
  }
}
