/* eslint-disable jsdoc/require-jsdoc -- Internal transaction boundaries are exercised by assignment authorization tests. */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type { AuthorizationResourceOwner } from '@gcs-ssc/authorization'
import { badRequest, notFound, throwApiError } from '~~/server/utils/api-errors'
import { resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { requireFreshAuthContext } from '~~/server/utils/authorize'
import {
  isEntityAssignmentRosterWorkable,
  canManageEntityAssignmentsWithContext,
  resolveEntityAssignmentOwner
} from '~~/server/utils/entity-assignment'
import { getActiveStructuralRoleAssignments } from '~~/server/utils/active-user-scopes'
import { defineUserAbilities } from '~~/server/utils/rbac'
import type { AssignableEntityType, Database, Entity_Type } from '~~/shared/types/database'
import { ENTITY_AUTHORIZATION_POLICIES } from '~~/shared/utils/entity-assignments'
import {
  executeExtensionEntityAssignmentManagement,
  resolveExtensionEntityAssignmentRuntime
} from '~~/server/utils/extension-entity-assignment'

export type EntityAssignmentTarget = { entityType: Entity_Type; entityId: string }
type CoreEntityAssignmentTarget = { entityType: AssignableEntityType; entityId: string }

export type EntityAssignmentManagementOptions = {
  /** Candidate that must still be an active member of the owning agency under transaction locks. */
  assigneeUserId?: string
}

const resolveAssigneeApplicationUserId = async (
  db: Kysely<Database>,
  commonUserId?: string
): Promise<string | undefined> => {
  if (!commonUserId) return undefined
  const candidate = await db.selectFrom('Common_User')
    .select('egcs_cn_auth_user_id')
    .where('id', '=', commonUserId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  return candidate ? String(candidate.egcs_cn_auth_user_id) : undefined
}

const ownerMatches = (
  expected: AuthorizationResourceOwner,
  current: AuthorizationResourceOwner
): boolean => {
  if (expected.kind !== current.kind || expected.agencyId !== current.agencyId) return false
  if (expected.kind === 'agreement' && current.kind === 'agreement') {
    return expected.agreementId === current.agreementId
  }
  if (expected.kind === 'applicant_recipient' && current.kind === 'applicant_recipient') {
    return expected.applicantRecipientId === current.applicantRecipientId
  }
  if (expected.kind === 'transfer_payment_stream' && current.kind === 'transfer_payment_stream') {
    return expected.transferPaymentId === current.transferPaymentId
      && expected.streamId === current.streamId
  }
  return expected.kind === 'agency' && current.kind === 'agency'
}

const lockAssignmentTarget = async (
  event: H3Event,
  trx: Transaction<Database>,
  target: CoreEntityAssignmentTarget,
  expectedOwner: AuthorizationResourceOwner
): Promise<void> => {
  const table = ENTITY_AUTHORIZATION_POLICIES[target.entityType].table as keyof Database
  const concreteEntity = await trx.selectFrom(table)
    .select('id')
    .where('id', '=', target.entityId)
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!concreteEntity) {
    return await notFound(event, 'ASSIGNMENT_TARGET_NOT_FOUND', 'apiErrors.request.not_found')
  }

  const entity = await trx.selectFrom('Common_Entity').select('id')
    .where('id', '=', target.entityId)
    .where('egcs_cn_entitytype', '=', target.entityType)
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!entity) return await notFound(event, 'ASSIGNMENT_TARGET_NOT_FOUND', 'apiErrors.request.not_found')

  const currentOwner = await resolveEntityAssignmentOwner(trx, target.entityType, target.entityId)
  if (!currentOwner || !ownerMatches(expectedOwner, currentOwner)) {
    return await throwApiError(event, {
      statusCode: 409,
      code: 'ASSIGNMENT_OWNER_CHANGED',
      key: 'apiErrors.assignments.owner_changed'
    })
  }

  await trx.selectFrom('Common_Entity_Assignment').select('id')
    .where('egcs_cn_entityid', '=', target.entityId)
    .where('egcs_cn_entitytype', '=', target.entityType)
    .where('_deleted', '=', false)
    .orderBy('id')
    .forUpdate()
    .execute()
  if (!await isEntityAssignmentRosterWorkable(trx, target.entityType, target.entityId)) {
    return await badRequest(event, 'ASSIGNMENT_ROSTER_LOCKED', 'apiErrors.request.invalid_status')
  }
}

const lockAndValidateAssignee = async (
  event: H3Event,
  trx: Transaction<Database>,
  commonUserId: string,
  target: CoreEntityAssignmentTarget
): Promise<void> => {
  const commonUser = await trx.selectFrom('Common_User')
    .select(['id', 'egcs_cn_auth_user_id'])
    .where('id', '=', commonUserId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!commonUser) {
    return await badRequest(event, 'ASSIGNMENT_USER_INACTIVE', 'apiErrors.assignments.invalid_assignee')
  }

  const applicationUser = await trx.selectFrom('user')
    .select('id')
    .where('id', '=', commonUser.egcs_cn_auth_user_id)
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!applicationUser) {
    return await badRequest(event, 'ASSIGNMENT_USER_INACTIVE', 'apiErrors.assignments.invalid_assignee')
  }
  const lockedCommonUser = await trx.selectFrom('Common_User')
    .select('id')
    .where('id', '=', commonUserId)
    .where('egcs_cn_auth_user_id', '=', String(applicationUser.id))
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!lockedCommonUser) {
    return await badRequest(event, 'ASSIGNMENT_USER_INACTIVE', 'apiErrors.assignments.invalid_assignee')
  }

  const roleAssignments = await trx.selectFrom('user_role_assignment')
    .select(['id', 'role_id'])
    .where('user_id', '=', String(applicationUser.id))
    .where('_deleted', '=', false)
    .orderBy('role_id')
    .orderBy('id')
    .execute()
  const roleIds = [...new Set(roleAssignments.map(assignment => String(assignment.role_id)))].sort()
  if (roleIds.length > 0) {
    await trx.selectFrom('role')
      .select('id')
      .where('id', 'in', roleIds)
      .orderBy('id')
      .forUpdate()
      .execute()
    await trx.selectFrom('user_role_assignment')
      .select('id')
      .where('user_id', '=', String(applicationUser.id))
      .where('role_id', 'in', roleIds)
      .where('_deleted', '=', false)
      .orderBy('role_id')
      .orderBy('id')
      .forUpdate()
      .execute()
    await trx.selectFrom('role_permission')
      .select('id')
      .where('role_id', 'in', roleIds)
      .where('_deleted', '=', false)
      .orderBy('role_id')
      .orderBy('id')
      .forUpdate()
      .execute()
    await trx.selectFrom('role_transfer_payment_scope')
      .select('id')
      .where('role_id', 'in', roleIds)
      .where('_deleted', '=', false)
      .orderBy('role_id')
      .orderBy('transfer_payment_profile_id')
      .orderBy('id')
      .forUpdate()
      .execute()
  }

  const activeAssignments = await getActiveStructuralRoleAssignments(trx, [String(applicationUser.id)])
  const owner = await resolveEntityAssignmentOwner(trx, target.entityType, target.entityId)
  const abilities = await defineUserAbilities(String(applicationUser.id), trx)
  let eligible = false
  if (owner?.kind === 'applicant_recipient') {
    eligible = abilities.authorize('applicant_recipient', 'update', { type: 'agency', agencyId: owner.agencyId })
  } else if (owner?.kind === 'agreement') {
    const agreement = await resolveAgreementScopeContext(owner.agreementId, trx)
    eligible = Boolean(agreement && abilities.authorize('agreement', 'update', agreement.scope))
  } else if (owner?.kind === 'transfer_payment_stream') {
    eligible = abilities.authorize('transfer_payment', 'update', {
      type: 'entity', agencyId: owner.agencyId,
      path: [
        { type: 'transfer_payment', id: owner.transferPaymentId },
        { type: 'transfer_payment_stream', id: owner.streamId }
      ]
    })
  } else if (owner?.kind === 'agency') {
    eligible = abilities.authorize('agency', 'update', { type: 'agency', agencyId: owner.agencyId })
  }
  if (!eligible || activeAssignments.length === 0) {
    return await badRequest(event, 'ASSIGNMENT_USER_OUTSIDE_AGENCY', 'apiErrors.assignments.invalid_assignee')
  }
}

const executeLockedAssignmentManagement = async <T>(
  event: H3Event,
  trx: Transaction<Database>,
  target: CoreEntityAssignmentTarget,
  owner: AuthorizationResourceOwner,
  callback: (trx: Transaction<Database>) => Promise<T>,
  options: EntityAssignmentManagementOptions
): Promise<T> => {
  if (options.assigneeUserId) {
    await lockAndValidateAssignee(event, trx, options.assigneeUserId, target)
  }
  await lockAssignmentTarget(event, trx, target, owner)
  return await callback(trx)
}

export const executeEntityAssignmentManagement = async <T>(
  event: H3Event,
  target: EntityAssignmentTarget,
  callback: (trx: Transaction<Database>) => Promise<T>,
  options: EntityAssignmentManagementOptions = {}
): Promise<T> => {
  if (target.entityType.includes(':')) {
    const runtime = await resolveExtensionEntityAssignmentRuntime(event, target.entityType, target.entityId)
    if (!runtime) return await notFound(event, 'ASSIGNMENT_TARGET_NOT_FOUND', 'apiErrors.request.not_found')
    const result = await executeExtensionEntityAssignmentManagement(
      event,
      runtime,
      callback,
      options.assigneeUserId
    )
    if (result === null) return await notFound(event, 'ASSIGNMENT_TARGET_NOT_FOUND', 'apiErrors.request.not_found')
    return result
  }
  const coreTarget = target as { entityType: AssignableEntityType; entityId: string }
  const db = event.context.$db
  const owner = await resolveEntityAssignmentOwner(db, coreTarget.entityType, coreTarget.entityId)
  if (!owner) return await notFound(event, 'ASSIGNMENT_TARGET_NOT_FOUND', 'apiErrors.request.not_found')
  const assigneeApplicationUserId = await resolveAssigneeApplicationUserId(db, options.assigneeUserId)

  if (owner.kind === 'agreement') {
    const agreement = await resolveAgreementScopeContext(owner.agreementId, db)
    if (!agreement) return await notFound(event, 'ASSIGNMENT_TARGET_NOT_FOUND', 'apiErrors.request.not_found')
    return await executeFreshAuthorizedAgreementWrite(
      event,
      db,
      owner.agreementId,
      agreement,
      async trx => await executeLockedAssignmentManagement(event, trx, coreTarget, owner, callback, options),
      { lockUserIds: assigneeApplicationUserId ? [assigneeApplicationUserId] : [], authorize: async (trx, _current, auth) => {
        if (!await canManageEntityAssignmentsWithContext(auth, trx, coreTarget.entityType, coreTarget.entityId)) {
          return await throwApiError(event, { statusCode: 403, code: 'FORBIDDEN', key: 'apiErrors.auth.forbidden' })
        }
      } }
    )
  }

  if (owner.kind === 'applicant_recipient') {
    return await db.transaction().execute(async trx => {
      const auth = await requireFreshAuthContext(event, trx, {
        lockUserIds: assigneeApplicationUserId ? [assigneeApplicationUserId] : []
      })
      if (!await canManageEntityAssignmentsWithContext(auth, trx, coreTarget.entityType, coreTarget.entityId)) {
        return await throwApiError(event, { statusCode: 403, code: 'FORBIDDEN', key: 'apiErrors.auth.forbidden' })
      }
      return await executeLockedAssignmentManagement(event, trx, coreTarget, owner, callback, options)
    })
  }

  // Agency and transfer-payment subjects deliberately do not support
  // manage_assignments. Casework without an Agreement or Proponent owner must
  // therefore remain unavailable through the generic roster mutation API.
  return await throwApiError(event, { statusCode: 403, code: 'FORBIDDEN', key: 'apiErrors.auth.forbidden' })
}
