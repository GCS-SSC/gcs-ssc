/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Assignment mutation helpers are covered by focused unit and PostgreSQL tests. */
import type { H3Event } from 'h3'
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { getActiveStructuralRoles } from '~~/server/utils/active-user-scopes'

type UserRoleAssignmentRole = {
  id: string
  agency_id?: string | number | bigint | null
}

type UserRoleAssignmentScope = {
  role_id: string
  agency_id?: string | number | bigint | null
}

type UserRoleAssignmentAuthorizationScope = {
  type: 'global'
} | {
  type: 'agency'
  agencyId: string
}

export interface UserRoleAssignmentRoleContext {
  agencyId?: string
  authorizationScope: UserRoleAssignmentAuthorizationScope
  transferPaymentIds: string[]
}

const routeBadRequest = async (
  event: H3Event,
  code: string,
  key: string
) => {
  const badRequestHandler = (globalThis as { badRequest?: typeof badRequest }).badRequest ?? badRequest
  return await badRequestHandler(event, code, key)
}

const routeNotFound = async (
  event: H3Event,
  code: string,
  key: string
) => {
  const notFoundHandler = (globalThis as { notFound?: typeof notFound }).notFound ?? notFound
  return await notFoundHandler(event, code, key)
}

/** Reads an active user whose authorization graph is already transaction-locked. */
export const fetchActiveUserRoleAssignmentUser = async (
  event: H3Event,
  db: Kysely<Database>,
  userId: string
) => {
  const user = await db
    .selectFrom('user')
    .where('id', '=', userId)
    .where('_deleted', '=', false)
    .select('id')
    .executeTakeFirst()

  if (!user) {
    return await routeNotFound(event, 'USER_NOT_FOUND', 'apiErrors.user.not_found')
  }

  return null
}

/** Reads an active role whose authorization graph is already transaction-locked. */
export const fetchActiveUserRoleAssignmentRole = async (
  event: H3Event,
  db: Kysely<Database>,
  roleId: string
) => {
  const role = await db
    .selectFrom('role')
    .where('id', '=', roleId)
    .where('_deleted', '=', false)
    .select(['id', 'agency_id'])
    .executeTakeFirst()

  if (!role) {
    return await routeNotFound(event, 'ROLE_NOT_FOUND', 'apiErrors.role.not_found')
  }

  return role
}

/** Resolves the lock scope and authorization scope for an assignment role. */
export const resolveUserRoleAssignmentRoleContext = async (
  event: H3Event,
  db: Kysely<Database>,
  role: UserRoleAssignmentRole | UserRoleAssignmentScope
) => {
  const roleId = String('id' in role ? role.id : role.role_id)
  const [structuralRole] = await getActiveStructuralRoles(db, [roleId])
  if (!structuralRole) {
    return await routeNotFound(event, 'ROLE_NOT_FOUND', 'apiErrors.role.not_found')
  }

  if (structuralRole.scopeType === 'global') {
    return {
      agencyId: structuralRole.agencyId ?? undefined,
      authorizationScope: { type: 'global' },
      transferPaymentIds: structuralRole.transferPaymentIds
    } satisfies UserRoleAssignmentRoleContext
  }

  if (!structuralRole.agencyId) {
    return await routeBadRequest(event, 'MISSING_AGENCY_ID', 'apiErrors.request.missing_agency_id')
  }

  return {
    agencyId: structuralRole.agencyId,
    authorizationScope: { type: 'agency', agencyId: structuralRole.agencyId },
    transferPaymentIds: structuralRole.transferPaymentIds
  } satisfies UserRoleAssignmentRoleContext
}

/** Compares the persisted scope inputs that determine assignment authorization. */
export const hasSameUserRoleAssignmentRoleContext = (
  left: UserRoleAssignmentRoleContext,
  right: UserRoleAssignmentRoleContext
): boolean => {
  return left.agencyId === right.agencyId
    && left.authorizationScope.type === right.authorizationScope.type
    && left.transferPaymentIds.length === right.transferPaymentIds.length
    && left.transferPaymentIds.every((id, index) => id === right.transferPaymentIds[index])
}
