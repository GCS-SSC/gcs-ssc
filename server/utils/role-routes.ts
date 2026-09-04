/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Role mutation helpers are covered by focused unit and PostgreSQL tests. */
import type { H3Event } from 'h3'
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { RoleInput, RolePatchInput, RolePermissionInput } from '~~/shared/types/schemas/rbac'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { isRoleAbilitySubject } from '@gcs-ssc/authorization'
import { getRoleScopeType, isAbilityAllowedForRoleScope, type RoleScopeType } from '~~/shared/utils/role-scope'

type RolePermission = {
  subject: RolePermissionInput['subject']
  access_level: RolePermissionInput['access_level']
  can_manage_assignments: boolean
}
type RoleParentLock = {
  agencyId?: string
  transferPaymentIds: string[]
}

interface ResolvedRoleScopeInput {
  roleAgencyId?: string
  transferPaymentIds: string[]
  roleScopeType: RoleScopeType
}

/** Returns active transfer payment scope IDs in lock-compatible order. */
export const getActiveRoleTransferPaymentIds = async (
  db: Kysely<Database>,
  roleId: string
): Promise<string[]> => {
  const rows = await db
    .selectFrom('role_transfer_payment_scope')
    .where('role_id', '=', roleId)
    .where('_deleted', '=', false)
    .select('transfer_payment_profile_id')
    .orderBy('transfer_payment_profile_id', 'asc')
    .execute()

  return rows.map(row => String(row.transfer_payment_profile_id))
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

/** Deduplicates role permissions by subject. */
export const normalizeRolePermissions = (permissions: RoleInput['permissions'] | RolePatchInput['permissions'] | undefined) => {
  if (!Array.isArray(permissions)) {
    return []
  }

  const subjects = new Set<string>()
  return permissions.filter(permission => {
    if (subjects.has(permission.subject)) {
      return false
    }

    subjects.add(permission.subject)
    return true
  })
}

/** Converts, filters, and deduplicates transfer payment scope identifiers. */
export const normalizeRoleTransferPaymentIds = (transferPaymentIds: RoleInput['transfer_payment_ids'] | RolePatchInput['transfer_payment_ids'] | undefined) => {
  if (!Array.isArray(transferPaymentIds)) {
    return []
  }

  return [...new Set(transferPaymentIds.map(value => String(value)))]
}

/** Derives the effective role scope type and normalized transfer payment ids. */
export const resolveRoleScopeInput = (
  agencyId: string | null | undefined,
  transferPaymentIds: string[]
): ResolvedRoleScopeInput => {
  const roleAgencyId = agencyId ? String(agencyId) : undefined

  return {
    roleAgencyId,
    transferPaymentIds,
    roleScopeType: getRoleScopeType(roleAgencyId ?? null, transferPaymentIds.length)
  }
}

/** Rejects permissions that are incompatible with the role's scope type. */
export const rejectInvalidRoleScopePermissions = async (
  event: H3Event,
  permissions: RolePermission[],
  roleScopeType: RoleScopeType
) => {
  const hasInvalidAbility = permissions.some(permission =>
    !isRoleAbilitySubject(permission.subject)
    || !isAbilityAllowedForRoleScope(permission.subject, roleScopeType)
  )
  if (hasInvalidAbility) {
    return await routeBadRequest(event, 'ROLE_SCOPE_ABILITY_MISMATCH', 'apiErrors.role.scope_ability_mismatch')
  }

  return null
}

/**
 * Applies one idempotent role-permission replacement inside the caller's locked transaction.
 * @param db Transaction database holding the role lock.
 * @param roleId Role receiving the ability delta.
 * @param subject Canonical permission subject.
 * @param permission Replacement permission, or null to remove it.
 */
export const setRolePermission = async (
  db: Kysely<Database>,
  roleId: string,
  subject: RolePermissionInput['subject'],
  permission: RolePermissionInput | null
): Promise<void> => {
  await db.updateTable('role_permission').set({ _deleted: true })
    .where('role_id', '=', roleId).where('subject', '=', subject)
    .where('_deleted', '=', false).execute()
  if (!permission) {
    return
  }
  await db.insertInto('role_permission').values({
    role_id: roleId,
    subject,
    access_level: permission.access_level,
    can_manage_assignments: permission.can_manage_assignments,
    _deleted: false
  }).execute()
}

/** Ensures scoped transfer payments belong to the role's agency and match its scope type. */
export const validateRoleTransferPaymentScope = async (
  event: H3Event,
  db: Kysely<Database>,
  roleAgencyId: string | undefined,
  transferPaymentIds: string[]
) => {
  if (!roleAgencyId) {
    if (transferPaymentIds.length === 0) {
      return null
    }

    return await routeBadRequest(event, 'MISSING_AGENCY_ID', 'apiErrors.request.missing_agency_id')
  }

  const agency = await db
    .selectFrom('Agency_Profile')
    .where('Agency_Profile.id', '=', roleAgencyId)
    .where('Agency_Profile._deleted', '=', false)
    .select('Agency_Profile.id')
    .forUpdate()
    .executeTakeFirst()
  if (!agency) {
    return await routeNotFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  }

  if (transferPaymentIds.length === 0) {
    return null
  }

  const scopedPrograms = await db
    .selectFrom('Transfer_Payment_Profile')
    .where('Transfer_Payment_Profile.id', 'in', transferPaymentIds)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .select([
      'Transfer_Payment_Profile.id as id',
      'Transfer_Payment_Profile.egcs_tp_agency as agency_id'
    ])
    .orderBy('Transfer_Payment_Profile.id', 'asc')
    .forUpdate()
    .execute()

  const allProgramsInAgency = scopedPrograms.length === transferPaymentIds.length &&
    scopedPrograms.every(program => String(program.agency_id) === roleAgencyId)

  if (!allProgramsInAgency) {
    return await routeBadRequest(event, 'PROGRAM_NOT_IN_AGENCY', 'apiErrors.role.program_not_in_agency')
  }

  return null
}

/** Locks the parent rows used by a role mutation in deterministic order. */
export const lockRoleParentRows = async (
  db: Kysely<Database>,
  { agencyId, transferPaymentIds }: RoleParentLock
): Promise<void> => {
  if (agencyId) {
    await db
      .selectFrom('Agency_Profile')
      .where('Agency_Profile.id', '=', agencyId)
      .select('Agency_Profile.id')
      .forUpdate()
      .executeTakeFirst()
  }

  const sortedTransferPaymentIds = [...new Set(transferPaymentIds)].sort((left, right) =>
    left.localeCompare(right, 'en', { numeric: true })
  )
  if (sortedTransferPaymentIds.length > 0) {
    await db
      .selectFrom('Transfer_Payment_Profile')
      .where('Transfer_Payment_Profile.id', 'in', sortedTransferPaymentIds)
      .select('Transfer_Payment_Profile.id')
      .orderBy('Transfer_Payment_Profile.id', 'asc')
      .forUpdate()
      .execute()
  }
}

/** Soft-deletes roles and all active role-owned link rows. */
export const softDeleteRoles = async (
  db: Kysely<Database>,
  roleIds: string[]
): Promise<void> => {
  const uniqueRoleIds = [...new Set(roleIds)]
  if (uniqueRoleIds.length === 0) {
    return
  }

  await db
    .updateTable('role_permission')
    .set({ _deleted: true })
    .where('role_id', 'in', uniqueRoleIds)
    .where('_deleted', '=', false)
    .execute()
  await db
    .updateTable('role_transfer_payment_scope')
    .set({ _deleted: true })
    .where('role_id', 'in', uniqueRoleIds)
    .where('_deleted', '=', false)
    .execute()
  await db
    .updateTable('user_role_assignment')
    .set({ _deleted: true })
    .where('role_id', 'in', uniqueRoleIds)
    .where('_deleted', '=', false)
    .execute()
  await db
    .updateTable('role')
    .set({ _deleted: true })
    .where('id', 'in', uniqueRoleIds)
    .where('_deleted', '=', false)
    .execute()
}
