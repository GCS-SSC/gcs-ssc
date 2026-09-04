/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Compatibility adapter signatures mirror the package-owned authorization services. */
import {
  isRoleAbilitySubject,
  UserAbilities
} from '@gcs-ssc/authorization'
import {
  resolveAssignedItemGrant,
  resolveAssignedItemTargetGrant,
  StaticAuthorizationRepository
} from '@gcs-ssc/authorization/server'
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { getActiveStructuralRoleAssignments } from './active-user-scopes'

/** Builds the canonical static authorization evaluator for an active user. */
export const defineUserAbilities = async (
  userId: string,
  db: Kysely<Database>
): Promise<UserAbilities> => {
  const repository = new StaticAuthorizationRepository(db, getActiveStructuralRoleAssignments)
  return await repository.loadUserAbilities(userId)
}

/** Builds canonical static authorization evaluators for several active users in one repository pass. */
export const defineUsersAbilities = async (
  userIds: string[],
  db: Kysely<Database>
): Promise<Map<string, UserAbilities>> => {
  const repository = new StaticAuthorizationRepository(db, getActiveStructuralRoleAssignments)
  return await repository.loadUsersAbilities(userIds)
}

/** Returns agency scopes contributed by active structural role assignments. */
export const getUserAssignmentAgencyScopes = async (
  userId: string,
  db: Kysely<Database>
): Promise<Array<{ agencyId: string }>> => {
  const repository = new StaticAuthorizationRepository(db, getActiveStructuralRoleAssignments)
  const agencyIds = await repository.listAssignedAgencyIds(userId)
  return agencyIds.map(agencyId => ({ agencyId }))
}

export {
  isRoleAbilitySubject,
  resolveAssignedItemGrant,
  resolveAssignedItemTargetGrant,
  UserAbilities
}
