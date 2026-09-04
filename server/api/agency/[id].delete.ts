import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import {
  authorize,
  authorizeWithFreshAuthContext,
  requireFreshAuthContext
} from '~~/server/utils/authorize'
import {
  guardRegisteredExtensionScopeDeletion,
  lockRegisteredExtensionAgreementScopes
} from '~~/server/utils/extensions'

type AgencyGrantGraph = {
  roleIds: string[]
  cleanupRoleIds: string[]
  userIds: string[]
}

/** Internal retry signal when the agency grant graph changes before its parent lock is acquired. */
class AgencyGrantGraphChanged extends Error {}

const sortIds = (ids: string[]) => [...new Set(ids)].sort((left, right) =>
  left.localeCompare(right, 'en', { numeric: true })
)

/**
 * Soft-deletes agency-owned roles and all active role link rows.
 *
 * @param trx - Active agency-deletion transaction.
 * @param roleIds - Ordered identifiers of roles owned by the agency.
 */
const softDeleteAgencyRoles = async (trx: Transaction<Database>, roleIds: string[]): Promise<void> => {
  if (roleIds.length === 0) {
    return
  }

  await trx
    .updateTable('role_permission')
    .set({ _deleted: true })
    .where('role_id', 'in', roleIds)
    .where('_deleted', '=', false)
    .execute()
  await trx
    .updateTable('role_transfer_payment_scope')
    .set({ _deleted: true })
    .where('role_id', 'in', roleIds)
    .where('_deleted', '=', false)
    .execute()
  await trx
    .updateTable('user_role_assignment')
    .set({ _deleted: true })
    .where('role_id', 'in', roleIds)
    .where('_deleted', '=', false)
    .execute()
  await trx
    .updateTable('role')
    .set({ _deleted: true })
    .where('id', 'in', roleIds)
    .where('_deleted', '=', false)
    .execute()
}

/**
 * Resolves the roles and users whose active grants are owned by an agency.
 *
 * @param trx - Active agency-deletion transaction.
 * @param agencyId - Agency whose grant graph will be mutated.
 * @returns Ordered role and user identifier sets.
 */
const resolveAgencyGrantGraph = async (
  trx: Kysely<Database>,
  agencyId: string
): Promise<AgencyGrantGraph> => {
  const [roles, roleAssignments] = await Promise.all([
    trx
      .selectFrom('role')
      .select(['id', '_deleted'])
      .where('agency_id', '=', agencyId)
      .execute(),
    trx
      .selectFrom('user_role_assignment')
      .innerJoin('role', 'role.id', 'user_role_assignment.role_id')
      .select('user_role_assignment.user_id as user_id')
      .where('role.agency_id', '=', agencyId)
      .where('user_role_assignment._deleted', '=', false)
      .execute()
  ])

  return {
    roleIds: sortIds(roles.filter(role => !role._deleted).map(role => String(role.id))),
    cleanupRoleIds: sortIds(roles.map(role => String(role.id))),
    userIds: sortIds(roleAssignments.map(assignment => String(assignment.user_id)))
  }
}

const agencyGrantGraphsMatch = (left: AgencyGrantGraph, right: AgencyGrantGraph) =>
  left.roleIds.join('\u0000') === right.roleIds.join('\u0000')
  && left.cleanupRoleIds.join('\u0000') === right.cleanupRoleIds.join('\u0000')
  && left.userIds.join('\u0000') === right.userIds.join('\u0000')

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const id = getRouterParam(event, 'id')
  if (!id) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(id)) {
    return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  }
  await authorize(event, 'agency', 'delete', { type: 'agency', agencyId: id })

  let updatedRows = BigInt(0)
  let completed = false
  for (let attempt = 0; attempt < 3 && !completed; attempt += 1) {
    const expectedGrantGraph = await resolveAgencyGrantGraph(db, id)
    try {
      updatedRows = await db.transaction().execute(async trx => {
        // Acquire the complete affected authorization graph before extension and parent rows.
        const authContext = await requireFreshAuthContext(event, trx, {
          lockRoleIds: expectedGrantGraph.cleanupRoleIds,
          lockUserIds: expectedGrantGraph.userIds
        })
        await lockRegisteredExtensionAgreementScopes(trx, id, [])
        const agency = await trx
          .selectFrom('Agency_Profile')
          .select('id')
          .where('id', '=', id)
          .where('_deleted', '=', false)
          .forUpdate('Agency_Profile')
          .executeTakeFirst()
        if (!agency) {
          return BigInt(0)
        }

        const currentGrantGraph = await resolveAgencyGrantGraph(trx, id)
        if (!agencyGrantGraphsMatch(expectedGrantGraph, currentGrantGraph)) {
          throw new AgencyGrantGraphChanged()
        }

        await authorizeWithFreshAuthContext(
          event,
          authContext,
          'agency',
          'delete',
          { type: 'agency', agencyId: id }
        )
        await guardRegisteredExtensionScopeDeletion(event, trx, {
          scope: 'agency',
          agencyId: id
        })

        const result = await trx
          .updateTable('Agency_Profile')
          .set({ _deleted: true })
          .where('id', '=', id)
          .where('_deleted', '=', false)
          .returning('id')
          .executeTakeFirst()

        if (!result) {
          return BigInt(0)
        }

        await softDeleteAgencyRoles(trx, currentGrantGraph.cleanupRoleIds)

        return BigInt(1)
      })
      completed = true
    } catch (error: unknown) {
      if (!(error instanceof AgencyGrantGraphChanged)) {
        throw error
      }
      if (attempt === 2) {
        return await badRequest(event, 'AGENCY_SCOPE_CHANGED', 'apiErrors.request.invalid_status')
      }
    }
  }

  if (updatedRows === BigInt(0)) {
    return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  }

  return { success: true }
})
