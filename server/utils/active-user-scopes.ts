/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- exported helper signatures fully describe canonical scope inputs and results */
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'

export type ActiveStructuralRoleAssignment = {
  assignmentId: string
  userId: string
  roleId: string
  scopeType: 'global' | 'agency' | 'program'
  agencyId: string | null
  transferPaymentId: string | null
}

export type ActiveStructuralRole = {
  roleId: string
  scopeType: 'global' | 'agency' | 'program'
  agencyId: string | null
  transferPaymentIds: string[]
}

export type ActiveUserManagementScope = {
  userId: string
  agencyIds: string[]
  /** Whether the user holds an active global role. */
  hasGlobalRole: boolean
}

/** Builds the SQL set of active roles whose parent links are structurally valid. */
export const selectActiveStructuralRoleIds = (db: Kysely<Database>) => db
  .selectFrom('role')
  .leftJoin('Agency_Profile', join => join
    .onRef('Agency_Profile.id', '=', 'role.agency_id')
    .on('Agency_Profile._deleted', '=', false))
  .where('role._deleted', '=', false)
  .where(eb => eb.or([
    eb.and([
      eb('role.agency_id', 'is', null),
      eb.not(eb.exists(eb.selectFrom('role_transfer_payment_scope')
        .select('role_transfer_payment_scope.id')
        .whereRef('role_transfer_payment_scope.role_id', '=', 'role.id')
        .where('role_transfer_payment_scope._deleted', '=', false)))
    ]),
    eb.and([
      eb('Agency_Profile.id', 'is not', null),
      eb.not(eb.exists(eb.selectFrom('role_transfer_payment_scope')
        .leftJoin('Transfer_Payment_Profile', join => join
          .onRef('Transfer_Payment_Profile.id', '=', 'role_transfer_payment_scope.transfer_payment_profile_id')
          .on('Transfer_Payment_Profile._deleted', '=', false))
        .select('role_transfer_payment_scope.id')
        .whereRef('role_transfer_payment_scope.role_id', '=', 'role.id')
        .where('role_transfer_payment_scope._deleted', '=', false)
        .where(inner => inner.or([
          inner('Transfer_Payment_Profile.id', 'is', null),
          inner('Transfer_Payment_Profile.egcs_tp_agency', '!=', inner.ref('role.agency_id'))
        ]))))
    ])
  ]))
  .select('role.id')

/** Resolves active roles and derives their scope from agency/program structure. */
export const getActiveStructuralRoles = async (
  db: Kysely<Database>,
  roleIds?: string[]
): Promise<ActiveStructuralRole[]> => {
  if (roleIds?.length === 0) return []

  let query = db.selectFrom('role')
    .leftJoin('Agency_Profile', join => join
      .onRef('Agency_Profile.id', '=', 'role.agency_id')
      .on('Agency_Profile._deleted', '=', false))
    .leftJoin('role_transfer_payment_scope', join => join
      .onRef('role_transfer_payment_scope.role_id', '=', 'role.id')
      .on('role_transfer_payment_scope._deleted', '=', false))
    .leftJoin('Transfer_Payment_Profile', join => join
      .onRef('Transfer_Payment_Profile.id', '=', 'role_transfer_payment_scope.transfer_payment_profile_id')
      .on('Transfer_Payment_Profile._deleted', '=', false))
    .where('role.id', 'in', selectActiveStructuralRoleIds(db))

  if (roleIds) query = query.where('role.id', 'in', roleIds)

  const rows = await query.select([
    'role.id as role_id',
    'role.agency_id',
    'Agency_Profile.id as active_agency_id',
    'role_transfer_payment_scope.id as scope_link_id',
    'Transfer_Payment_Profile.id as transfer_payment_id',
    'Transfer_Payment_Profile.egcs_tp_agency as transfer_payment_agency_id'
  ]).execute()

  const grouped = new Map<string, typeof rows>()
  for (const row of rows) {
    const roleId = String(row.role_id)
    const groupedRows = grouped.get(roleId)
    if (groupedRows) groupedRows.push(row)
    else grouped.set(roleId, [row])
  }

  const result: ActiveStructuralRole[] = []
  for (const roleRows of grouped.values()) {
    const first = roleRows[0]!
    const agencyId = first.agency_id == null ? null : String(first.agency_id)
    const transferPaymentIds = [...new Set(roleRows.flatMap(row =>
      row.scope_link_id != null
      && row.transfer_payment_id != null
      && String(row.transfer_payment_agency_id) === agencyId
        ? [String(row.transfer_payment_id)]
        : []
    ))].sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))

    const scopeType: ActiveStructuralRole['scopeType'] = agencyId === null
      ? 'global'
      : transferPaymentIds.length > 0
        ? 'program'
        : 'agency'

    result.push({
      roleId: String(first.role_id),
      scopeType,
      agencyId,
      transferPaymentIds
    })
  }

  return result
}

/** Resolves active role assignments with structurally derived role scopes. */
export const getActiveStructuralRoleAssignments = async (
  db: Kysely<Database>,
  userIds: string[]
): Promise<ActiveStructuralRoleAssignment[]> => {
  if (userIds.length === 0) return []

  const rows = await db.selectFrom('user_role_assignment')
    .where('user_role_assignment.user_id', 'in', userIds)
    .where('user_role_assignment._deleted', '=', false)
    .select([
      'user_role_assignment.id as assignment_id',
      'user_role_assignment.user_id as user_id',
      'user_role_assignment.role_id'
    ]).execute()
  const roles = await getActiveStructuralRoles(db, [...new Set(rows.map(row => String(row.role_id)))])
  const rolesById = new Map(roles.map(role => [role.roleId, role]))
  const result: ActiveStructuralRoleAssignment[] = []

  for (const row of rows) {
    const role = rolesById.get(String(row.role_id))
    if (!role) continue

    if (role.scopeType === 'program') {
      for (const transferPaymentId of role.transferPaymentIds) {
        result.push({
          assignmentId: String(row.assignment_id),
          userId: String(row.user_id),
          roleId: role.roleId,
          scopeType: 'program',
          agencyId: role.agencyId,
          transferPaymentId
        })
      }
      continue
    }

    result.push({
      assignmentId: String(row.assignment_id),
      userId: String(row.user_id),
      roleId: role.roleId,
      scopeType: role.scopeType,
      agencyId: role.agencyId,
      transferPaymentId: null
    })
  }

  return result
}

/** Resolves the complete active target footprint used only for user administration. */
export const getActiveUserManagementScopes = async (
  db: Kysely<Database>,
  userIds: string[]
): Promise<ActiveUserManagementScope[]> => {
  if (userIds.length === 0) return []

  const activeUsers = await db
    .selectFrom('user')
    .where('id', 'in', userIds)
    .where('_deleted', '=', false)
    .select('id')
    .execute()
  const activeUserIds = activeUsers.map(user => String(user.id))
  if (activeUserIds.length === 0) return []

  const roleAssignments = await getActiveStructuralRoleAssignments(db, activeUserIds)
  const scopesByUserId = new Map(activeUsers.map(user => [String(user.id), {
    agencyIds: new Set<string>(),
    hasGlobalRole: false
  }]))

  for (const assignment of roleAssignments) {
    const scope = scopesByUserId.get(assignment.userId)
    if (!scope) continue
    if (assignment.scopeType === 'global') scope.hasGlobalRole = true
    else if (assignment.agencyId) scope.agencyIds.add(assignment.agencyId)
  }

  return [...scopesByUserId.entries()].map(([userId, scope]) => ({
    userId,
    agencyIds: [...scope.agencyIds].sort((left, right) => left.localeCompare(right, 'en', { numeric: true })),
    hasGlobalRole: scope.hasGlobalRole
  }))
}
