/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Temporary coverage while authorization APIs receive complete documentation. */
import type { H3Event } from 'h3'
import type { Kysely, Selectable } from 'kysely'
import {
  evaluateAuthorizationResolution,
  type ExactEntityTarget,
  type AuthorizationResolution
} from '@gcs-ssc/authorization'
import { canonicalizeAuthorizationLockIds } from '@gcs-ssc/authorization/server'
import type { AbilityAction, AuthorizationSubject } from '~~/shared/utils/abilities'
import type { Scope } from '~~/shared/utils/scopes'
import type { AssignableEntityType, Database } from '~~/shared/types/database'
import {
  defineUserAbilities,
  getUserAssignmentAgencyScopes,
  resolveAssignedItemGrant,
  resolveAssignedItemTargetGrant
} from './rbac'
import { forbidden, notFound, unauthorized } from './api-errors'
import { auth } from './auth'
import {
  getActiveStructuralRoleAssignments,
  getActiveStructuralRoles,
  getActiveUserManagementScopes
} from './active-user-scopes'

export interface AuthContext {
  userId: string
  userAbilities: Awaited<ReturnType<typeof defineUserAbilities>>
}

export interface FreshAuthorizationOptions {
  lockRoleIds?: string[]
  lockUserIds?: string[]
}

export type TransferPaymentVisibility =
  | { access: 'all' }
  | { access: 'none' }
  | {
    access: 'scoped'
    agencyIds: string[]
    transferPaymentIds: string[]
  }

type RoleRecord = Selectable<Database['role']>

type AuthorizeResolver<T = undefined> = (args: {
  event: H3Event
  context: AuthContext
  subject: AuthorizationSubject
  action: AbilityAction
}) => Promise<AuthorizationResolution<T>>

export type AuthorizeResult<T = undefined> = AuthContext & {
  data?: T
  scope?: Scope
  agencyIds?: string[]
  hasGlobalAccess?: boolean
}

export interface AgencyAuthorizationAccess {
  agencyIds: string[]
  hasGlobalAccess: boolean
}

/** Authorizes an active exact-item assignment through the central authorization boundary. */
export const authorizeAssignedItem = async (
  event: H3Event,
  entityType: AssignableEntityType,
  entityId: string
): Promise<AuthContext> => {
  const context = await requireAuthContext(event)
  const grant = await resolveAssignedItemGrant(context.userId, entityType, entityId, event.context.$db)
  return grant ? context : await forbidden(event)
}

/** Authorizes a caller-supplied exact target without interpreting route shape. */
export const authorizeAssignedTarget = async (
  event: H3Event,
  target: ExactEntityTarget<AssignableEntityType>
): Promise<AuthContext> => {
  const context = await requireAuthContext(event)
  const grant = await resolveAssignedItemTargetGrant(
    context.userId,
    target,
    event.context.$db
  )
  return grant ? context : await forbidden(event)
}

/** Revalidates and locks an exact-item assignment inside a protected-write transaction. */
export const authorizeFreshAssignedItem = async (
  event: H3Event,
  trx: Kysely<Database>,
  context: AuthContext,
  entityType: AssignableEntityType,
  entityId: string,
  action: AbilityAction = 'update'
): Promise<void> => {
  const grant = await resolveAssignedItemGrant(context.userId, entityType, entityId, trx, { lock: true })
  if (!grant) return await forbidden(event)
  const { resolveEntityAssignmentOwner } = await import('./entity-assignment')
  const owner = await resolveEntityAssignmentOwner(trx, entityType, entityId)
  if (!owner) return await forbidden(event)
  if (owner.kind === 'applicant_recipient') {
    if (!context.userAbilities.authorize('applicant_recipient', action, { type: 'agency', agencyId: owner.agencyId })) {
      return await forbidden(event)
    }
    return
  }
  if (owner.kind === 'agreement') {
    const { resolveAgreementScopeContext } = await import('./agreement')
    const agreement = await resolveAgreementScopeContext(owner.agreementId, trx)
    if (!agreement || !context.userAbilities.authorize('agreement', action, agreement.scope)) {
      return await forbidden(event)
    }
    return
  }
  if (owner.kind === 'transfer_payment_stream') {
    if (!context.userAbilities.authorize('transfer_payment', action, {
      type: 'entity', agencyId: owner.agencyId,
      path: [
        { type: 'transfer_payment', id: owner.transferPaymentId },
        { type: 'transfer_payment_stream', id: owner.streamId }
      ]
    })) return await forbidden(event)
    return
  }
  if (!context.userAbilities.authorize('agency', action, { type: 'agency', agencyId: owner.agencyId })) {
    return await forbidden(event)
  }
}

/** Revalidates a caller-supplied exact target inside a protected-write transaction. */
export const authorizeFreshAssignedTarget = async (
  event: H3Event,
  trx: Kysely<Database>,
  context: AuthContext,
  target: ExactEntityTarget<AssignableEntityType>
): Promise<void> => {
  const grant = await resolveAssignedItemTargetGrant(
    context.userId,
    target,
    trx,
    { lock: true }
  )
  if (!grant) await forbidden(event)
}

const requireSessionUserId = async (event: H3Event): Promise<string> => {
  if (event.context.$authContext) {
    return event.context.$authContext.userId
  }

  const session = await auth.api.getSession({ headers: event.headers })
  if (!session) {
    return await unauthorized(event)
  }

  return String(session.user.id)
}

const requireActiveUser = async (
  event: H3Event,
  userId: string,
  db: Kysely<Database>
): Promise<void> => {
  const user = await db
    .selectFrom('user')
    .where('id', '=', userId)
    .where('_deleted', '=', false)
    .select('id')
    .executeTakeFirst()

  if (!user) {
    await unauthorized(event)
  }
}

/**
 * Locks the authenticated and explicitly managed users' active grant graphs.
 *
 * All principals and every role assigned to any of them share ordered lock sets,
 * so concurrent management cannot invert user or role locks. The user-row
 * FOR UPDATE lock also serializes new assignment inserts: their user_id
 * foreign-key check requires a conflicting key-share lock, whereas locking
 * existing assignment rows would not prevent predicate phantoms.
 */
const lockFreshAuthorizationRows = async (
  event: H3Event,
  db: Kysely<Database>,
  userId: string,
  lockUserIds: string[],
  lockRoleIds: string[]
): Promise<void> => {
  const sortedUserIds = canonicalizeAuthorizationLockIds([userId, ...lockUserIds])
  const lockedUsers = await db
    .selectFrom('user')
    .where('id', 'in', sortedUserIds)
    .select(['id', '_deleted'])
    .orderBy('id', 'asc')
    .forUpdate()
    .execute()
  const authenticatedUser = lockedUsers.find(user => String(user.id) === userId)
  if (!authenticatedUser || authenticatedUser._deleted) {
    await unauthorized(event)
  }

  const principalAssignments = await db
    .selectFrom('user_role_assignment')
    .where('user_id', 'in', sortedUserIds)
    .where('_deleted', '=', false)
    .select(['id', 'user_id', 'role_id'])
    .orderBy('user_id', 'asc')
    .orderBy('role_id', 'asc')
    .orderBy('id', 'asc')
    .execute()
  const roleIds = canonicalizeAuthorizationLockIds([
    ...principalAssignments.map(assignment => String(assignment.role_id)),
    ...lockRoleIds
  ])
  if (roleIds.length === 0) {
    return
  }

  await db
    .selectFrom('role')
    .where('id', 'in', roleIds)
    .select('id')
    .orderBy('id', 'asc')
    .forUpdate()
    .execute()
  await db
    .selectFrom('user_role_assignment')
    .where('user_id', 'in', sortedUserIds)
    .where('role_id', 'in', roleIds)
    .where('_deleted', '=', false)
    .select('id')
    .orderBy('user_id', 'asc')
    .orderBy('role_id', 'asc')
    .orderBy('id', 'asc')
    .forUpdate()
    .execute()
  await db
    .selectFrom('role_permission')
    .where('role_id', 'in', roleIds)
    .select('id')
    .orderBy('role_id', 'asc')
    .orderBy('id', 'asc')
    .forUpdate()
    .execute()
  await db
    .selectFrom('role_transfer_payment_scope')
    .where('role_id', 'in', roleIds)
    .select('id')
    .orderBy('role_id', 'asc')
    .orderBy('id', 'asc')
    .forUpdate()
    .execute()
}

/**
 * Retrieves the authorization context for the current request.
 *
 * @param event - The H3 event.
 * @returns The authorization context containing user ID and abilities.
 * @throws UnauthorizedError if no session is found.
 */
export const requireAuthContext = async (event: H3Event): Promise<AuthContext> => {
  if (event.context.$authContext) {
    return event.context.$authContext
  }

  const userId = await requireSessionUserId(event)
  await requireActiveUser(event, userId, event.context.$db)

  const context = {
    userId,
    userAbilities: await defineUserAbilities(userId, event.context.$db)
  }

  event.context.$authContext = context

  return context
}

/**
 * Rebuilds an authorization context against a transaction database.
 *
 * The result is intentionally not stored on the request event: transaction
 * snapshots and locks must never replace the normal request-cached context.
 */
export const requireFreshAuthContext = async (
  event: H3Event,
  db: Kysely<Database>,
  options: FreshAuthorizationOptions = {}
): Promise<AuthContext> => {
  const userId = await requireSessionUserId(event)
  await lockFreshAuthorizationRows(
    event,
    db,
    userId,
    options.lockUserIds ?? [],
    options.lockRoleIds ?? []
  )

  return {
    userId,
    userAbilities: await defineUserAbilities(userId, db)
  }
}

/**
 * Evaluates an authorization resolution with an explicitly supplied context.
 */
const authorizeWithContext = async <A extends AbilityAction, T = undefined>(
  event: H3Event,
  context: AuthContext,
  subject: AuthorizationSubject,
  action: A,
  scopeOrResolver: Scope | AuthorizeResolver<T>
): Promise<AuthorizeResult<T>> => {
  const resolution =
    typeof scopeOrResolver === 'function'
      ? await scopeOrResolver({ event, context, subject, action })
      : { scope: scopeOrResolver }

  const decision = evaluateAuthorizationResolution(
    context.userAbilities,
    subject,
    action,
    resolution
  )
  if (!decision.allowed) return await forbidden(event)
  const { allowed: _allowed, ...authorized } = decision
  return { ...context, ...authorized }
}

/**
 * Evaluates authorization with a context whose grant graph is already transaction-locked.
 *
 * This must be used after `requireFreshAuthContext` when later entity locks are
 * required. Calling `authorizeFresh` after entity or extension locks would
 * invert the protected-write lock order.
 */
export const authorizeWithFreshAuthContext = async <A extends AbilityAction, T = undefined>(
  event: H3Event,
  context: AuthContext,
  subject: AuthorizationSubject,
  action: A,
  scopeOrResolver: Scope | AuthorizeResolver<T>
): Promise<AuthorizeResult<T>> => await authorizeWithContext(
  event,
  context,
  subject,
  action,
  scopeOrResolver
)

/**
 * Authorizes an action on a subject within a specific scope.
 *
 * @param event - The H3 event.
 * @param subject - The subject to authorize action on.
 * @param action - The action to perform.
 * @param scopeOrResolver - The scope or a resolver function that returns scope/resolution.
 * @returns The authorization result containing context and scope data.
 * @throws ForbiddenError if authorization fails.
 */
export const authorize = async <A extends AbilityAction, T = undefined>(
  event: H3Event,
  subject: AuthorizationSubject,
  action: A,
  scopeOrResolver: Scope | AuthorizeResolver<T>
): Promise<AuthorizeResult<T>> => {
  const context = await requireAuthContext(event)
  return await authorizeWithContext(event, context, subject, action, scopeOrResolver)
}

/**
 * Authorizes with a freshly rebuilt, transaction-locked grant context.
 */
export const authorizeFresh = async <A extends AbilityAction, T = undefined>(
  event: H3Event,
  subject: AuthorizationSubject,
  action: A,
  scopeOrResolver: Scope | AuthorizeResolver<T>,
  db: Kysely<Database>,
  options: FreshAuthorizationOptions = {}
): Promise<AuthorizeResult<T>> => {
  const context = await requireFreshAuthContext(event, db, options)
  return await authorizeWithContext(event, context, subject, action, scopeOrResolver)
}

/**
 * Resolves the agencies where an authorization context can perform an action.
 *
 * @param context - Authenticated user and resolved abilities.
 * @param subject - Resource subject to authorize.
 * @param action - Action to authorize.
 * @param db - Database used to resolve the caller's assigned agencies.
 * @returns Global access metadata or the authorized agency identifiers.
 */
export const resolveAuthorizedAgencyAccess = async <A extends AbilityAction>(
  context: AuthContext,
  subject: AuthorizationSubject,
  action: A,
  db: Kysely<Database>
): Promise<AgencyAuthorizationAccess> => {
  if (context.userAbilities.authorize(subject, action, { type: 'global' })) {
    return { agencyIds: [], hasGlobalAccess: true }
  }

  const scopes = await getUserAssignmentAgencyScopes(context.userId, db)
  const agencyIds = [
    ...new Set(
      scopes
        .filter(scope =>
          context.userAbilities.authorize(subject, action, { type: 'agency', agencyId: scope.agencyId })
        )
        .map(scope => scope.agencyId)
    )
  ]

  return { agencyIds, hasGlobalAccess: false }
}

/**
 * Creates an authorization resolver for any agency the user has access to.
 *
 * @param db - The database instance.
 * @returns An AuthorizeResolver.
 */
export const resolveAnyAgency = (db: Kysely<Database>): AuthorizeResolver => {
  return async ({ context, subject, action }) => {
    return await resolveAuthorizedAgencyAccess(context, subject, action, db)
  }
}

/**
 * Creates an authorization resolver for transfer payment visibility.
 *
 * @param db - The database instance.
 * @returns An AuthorizeResolver with agency/program visibility data.
 */
export const resolveTransferPaymentVisibility = (
  db: Kysely<Database>
): AuthorizeResolver<TransferPaymentVisibility> => {
  return async ({ context, subject, action }) => {
    if (context.userAbilities.authorize(subject, action, { type: 'global' })) {
      return {
        bypass: true,
        data: { access: 'all' }
      }
    }

    const assignmentScopes = await getUserAssignmentAgencyScopes(context.userId, db)
    const assignmentAgencyIds = [...new Set(assignmentScopes.map(scope => scope.agencyId).filter(Boolean))]

    const agencyIds = assignmentAgencyIds.filter(agencyId =>
      context.userAbilities.authorize(subject, action, { type: 'agency', agencyId })
    )

    const structuralAssignments = await getActiveStructuralRoleAssignments(db, [context.userId])
    const roleScopedProgramIds = [...new Set(structuralAssignments.flatMap(assignment =>
      assignment.scopeType === 'program' && assignment.transferPaymentId != null
        ? [assignment.transferPaymentId]
        : []))]

    if (!agencyIds.length && roleScopedProgramIds.length === 0) {
      return {
        bypass: true,
        data: { access: 'none' }
      }
    }

    let profilesQuery = db
      .selectFrom('Transfer_Payment_Profile')
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .select([
        'Transfer_Payment_Profile.id as id',
        'Transfer_Payment_Profile.egcs_tp_agency as agency_id'
      ])

    if (agencyIds.length > 0 && roleScopedProgramIds.length > 0) {
      profilesQuery = profilesQuery.where(eb => eb.or([
        eb('Transfer_Payment_Profile.egcs_tp_agency', 'in', agencyIds),
        eb('Transfer_Payment_Profile.id', 'in', roleScopedProgramIds)
      ]))
    } else if (agencyIds.length > 0) {
      profilesQuery = profilesQuery.where('Transfer_Payment_Profile.egcs_tp_agency', 'in', agencyIds)
    } else {
      profilesQuery = profilesQuery.where('Transfer_Payment_Profile.id', 'in', roleScopedProgramIds)
    }

    const profiles = await profilesQuery.execute()

    const transferPaymentIds = profiles
      .filter(profile =>
        context.userAbilities.authorize(subject, action, {
          type: 'entity',
          agencyId: String(profile.agency_id),
          path: [{ type: 'transfer_payment', id: String(profile.id) }]
        })
      )
      .map(profile => String(profile.id))

    if (agencyIds.length === 0 && transferPaymentIds.length === 0) {
      return {
        bypass: true,
        data: { access: 'none' }
      }
    }

    return {
      bypass: true,
      data: {
        access: 'scoped',
        agencyIds,
        transferPaymentIds
      }
    }
  }
}

/**
 * Creates an authorization resolver for a specific role scope.
 *
 * @param roleId - The ID of the role.
 * @param db - The database instance.
 * @returns An AuthorizeResolver.
 */
export const resolveRoleScope = (roleId: string, db: Kysely<Database>): AuthorizeResolver<RoleRecord> => {
  return async ({ event, context, subject, action }) => {
    const role = await db
      .selectFrom('role')
      .where('id', '=', roleId)
      .where('role._deleted', '=', false)
      .selectAll()
      .executeTakeFirst()

    if (!role) {
      return await notFound(event, 'ROLE_NOT_FOUND', 'apiErrors.role.not_found')
    }

    const roleAgencyId = role.agency_id ? String(role.agency_id) : null
    const scope: Scope = roleAgencyId === null
      ? { type: 'global' }
      : { type: 'agency', agencyId: roleAgencyId }

    const [structuralRole] = await getActiveStructuralRoles(db, [roleId])
    if (!structuralRole) {
      if (!context.userAbilities.authorize(subject, action, scope)) return await forbidden(event)
      return await notFound(event, 'ROLE_NOT_FOUND', 'apiErrors.role.not_found')
    }

    return { scope, data: role }
  }
}

/**
 * Creates an authorization resolver for user-scoped access, optionally allowing self-reads.
 *
 * @param targetUserId - The ID of the user being accessed.
 * @param db - The database instance.
 * @param options - Configuration options for the resolver.
 * @param options.allowSelfRead - Whether to allow the user to read their own data regardless of RBAC.
 * @returns An AuthorizeResolver that evaluates access based on global or agency-specific roles.
 */
export const resolveUserScopes = (
  targetUserId: string,
  db: Kysely<Database>,
  options: { allowSelfRead?: boolean; requireAllScopes?: boolean } = { allowSelfRead: true }
): AuthorizeResolver => {
  return async ({ context, action }) => {
    if (action === 'read' && options.allowSelfRead && context.userId === targetUserId) {
      return { bypass: true }
    }

    const resolution = await resolveUserScopeAccess(targetUserId, db, context, action)
    if (options.requireAllScopes && 'scopes' in resolution) {
      const hasEveryScope = resolution.scopes.length > 0
        && resolution.scopes.every(scope => context.userAbilities.authorize('user', action, scope))
      return hasEveryScope ? { bypass: true } : { scopes: [] }
    }
    return resolution
  }
}

/** Resolves the target's complete user-management footprint. */
const resolveUserScopeAccess = async (
  targetUserId: string,
  db: Kysely<Database>,
  context: AuthContext,
  action: AbilityAction
): Promise<{ bypass: true } | { scopes: Scope[] }> => {
  if (
    context.userAbilities.authorize('user', action, { type: 'global' })
  ) {
    return { bypass: true }
  }

  const [targetScope] = await getActiveUserManagementScopes(db, [targetUserId])
  if (!targetScope) return { scopes: [] }

  const scopes: Scope[] = targetScope.agencyIds.map(agencyId => ({
    type: 'agency',
    agencyId
  }))
  if (targetScope.hasGlobalRole) scopes.unshift({ type: 'global' })

  return { scopes }
}

/**
 * Checks an action against the same target scopes used by `resolveUserScopes`.
 *
 * @param targetUserId - User whose active structural role footprint is checked.
 * @param db - Database used to resolve target scopes.
 * @param context - Authenticated caller and abilities.
 * @param action - User action to authorize.
 * @returns Whether any resolved target scope is authorized.
 */
export const canAuthorizeUserScopes = async (
  targetUserId: string,
  db: Kysely<Database>,
  context: AuthContext,
  action: AbilityAction
): Promise<boolean> => {
  const resolution = await resolveUserScopeAccess(targetUserId, db, context, action)
  if ('bypass' in resolution) {
    return true
  }

  return resolution.scopes.length > 0
    && resolution.scopes.every(scope => context.userAbilities.authorize('user', action, scope))
}
