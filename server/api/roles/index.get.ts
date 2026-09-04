/* eslint-disable jsdoc/require-jsdoc -- Query-construction callbacks are local and covered by route tests. */
import type { H3Event } from 'h3'
import { PaginationSchema } from '~~/shared/types/schemas'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { authorize, resolveAnyAgency } from '~~/server/utils/authorize'
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { getRoleScopeType } from '~~/shared/utils/role-scope'
import { selectActiveStructuralRoleIds } from '~~/server/utils/active-user-scopes'
import { escapeLikePattern } from '~~/server/utils/sql-like'

type RolePermissionRow = { role_id: unknown; subject: string; access_level: string | null; can_manage_assignments: boolean }
type RoleTransferPaymentScopeRow = { role_id: unknown; transfer_payment_profile_id: unknown }
type RoleAgencyRow = { id: unknown; name_en: string; name_fr: string }
type RoleListRow = {
  id: unknown
  agency_id?: unknown
}

const groupRolePermissions = (abilityRows: RolePermissionRow[]) => {
  const abilitiesByRoleId = new Map<string, Array<{ subject: string; access_level: string | null; can_manage_assignments: boolean }>>()
  for (const abilityRow of abilityRows) {
    const roleId = String(abilityRow.role_id)
    const roleAbilities = abilitiesByRoleId.get(roleId) ?? []
    roleAbilities.push({
      subject: abilityRow.subject,
      access_level: abilityRow.access_level,
      can_manage_assignments: abilityRow.can_manage_assignments
    })
    abilitiesByRoleId.set(roleId, roleAbilities)
  }

  return abilitiesByRoleId
}

const groupRoleTransferPaymentScopes = (scopeRows: RoleTransferPaymentScopeRow[]) => {
  const transferPaymentsByRoleId = new Map<string, string[]>()
  for (const scopeRow of scopeRows) {
    const roleId = String(scopeRow.role_id)
    const roleTransferPayments = transferPaymentsByRoleId.get(roleId) ?? []
    roleTransferPayments.push(String(scopeRow.transfer_payment_profile_id))
    transferPaymentsByRoleId.set(roleId, roleTransferPayments)
  }

  return transferPaymentsByRoleId
}

const collectRoleAgencyIds = (items: RoleListRow[]) => [
  ...new Set(items.flatMap(role => role.agency_id === null || role.agency_id === undefined
    ? []
    : [String(role.agency_id)]))
]

const mapRoleAgenciesById = (agencyRows: RoleAgencyRow[]) => {
  const agenciesById = new Map<string, { name_en: string; name_fr: string }>()
  for (const agency of agencyRows) {
    agenciesById.set(String(agency.id), {
      name_en: agency.name_en,
      name_fr: agency.name_fr
    })
  }

  return agenciesById
}

const attachRoleListDetails = <Role extends RoleListRow>(
  items: Role[],
  abilitiesByRoleId: Map<string, Array<{ subject: string; access_level: string | null; can_manage_assignments: boolean }>>,
  transferPaymentsByRoleId: Map<string, string[]>,
  agenciesById: Map<string, { name_en: string; name_fr: string }>
) => items.map(role => {
  const roleId = String(role.id)
  const agencyId = role.agency_id === null || role.agency_id === undefined ? null : String(role.agency_id)
  const agency = agencyId ? agenciesById.get(agencyId) : null
  return {
    ...role,
    id: roleId,
    agency_id: agencyId,
    agency_name_en: agency?.name_en ?? null,
    agency_name_fr: agency?.name_fr ?? null,
    permissions: abilitiesByRoleId.get(roleId) ?? [],
    transfer_payment_ids: transferPaymentsByRoleId.get(roleId) ?? [],
    scope_type: getRoleScopeType(agencyId, (transferPaymentsByRoleId.get(roleId) ?? []).length)
  }
})

export default defineEventHandler(async event => {
  const db = event.context.$db
  const { agencyIds = [], hasGlobalAccess = false } = await authorize(
    event,
    'role',
    'read',
    resolveAnyAgency(db)
  )

  if (hasGlobalAccess) {
    return await listRolesForScopes(event, db, null)
  }

  return await listRolesForScopes(event, db, agencyIds)
})

/**
 * Lists roles filtered by agency scopes.
 *
 * @param event - The H3 event.
 * @param db - The database instance.
 * @param agencyIds - The list of agency IDs to filter by, or null for all.
 * @returns The list of roles with stats.
 */
const listRolesForScopes = async (event: H3Event, db: Kysely<Database>, agencyIds: string[] | null) => {
  const query = await getValidatedQueryI18n(event, PaginationSchema)
  const { page, limit, search } = query
  const offset = (page - 1) * limit

  let scopedQuery = db
    .selectFrom('role')
    .where('_deleted', '=', false)
    .where('role.id', 'in', selectActiveStructuralRoleIds(db))

  if (agencyIds) {
    scopedQuery = scopedQuery.where(eb => eb.or([
      eb('role.agency_id', 'is', null),
      eb('role.agency_id', 'in', agencyIds)
    ]))
  }

  let filteredQuery = scopedQuery
  if (search) {
    const escapedSearch = escapeLikePattern(search)
    filteredQuery = filteredQuery.where(eb =>
      eb.or([eb('name_en', 'ilike', `%${escapedSearch}%`), eb('name_fr', 'ilike', `%${escapedSearch}%`)])
    )
  }

  const [items, countResult, statsResult] = await Promise.all([
    filteredQuery
      .select([
        'role.id as id',
        'role.name_en as name_en',
        'role.name_fr as name_fr',
        'role.description_en as description_en',
        'role.description_fr as description_fr',
        'role.agency_id as agency_id'
      ])
      .orderBy('id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    filteredQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst(),
    scopedQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst()
  ])

  const roleIds = items.map(role => role.id)
  const [abilityRows, transferPaymentScopeRows] = roleIds.length > 0
    ? await Promise.all([
        db
          .selectFrom('role_permission')
          .where('role_id', 'in', roleIds)
          .where('_deleted', '=', false)
          .select(['role_id', 'subject', 'access_level', 'can_manage_assignments'])
          .execute(),
        db
          .selectFrom('role_transfer_payment_scope')
          .innerJoin('role', 'role.id', 'role_transfer_payment_scope.role_id')
          .innerJoin('Transfer_Payment_Profile', join => join
            .onRef('Transfer_Payment_Profile.id', '=', 'role_transfer_payment_scope.transfer_payment_profile_id')
            .onRef('Transfer_Payment_Profile.egcs_tp_agency', '=', 'role.agency_id')
            .on('Transfer_Payment_Profile._deleted', '=', false))
          .where('role_transfer_payment_scope.role_id', 'in', roleIds)
          .where('role_transfer_payment_scope._deleted', '=', false)
          .select([
            'role_transfer_payment_scope.role_id',
            'role_transfer_payment_scope.transfer_payment_profile_id'
          ])
          .execute()
      ])
    : [[], []]

  const abilitiesByRoleId = groupRolePermissions(abilityRows)
  const transferPaymentsByRoleId = groupRoleTransferPaymentScopes(transferPaymentScopeRows)

  const agencyIdsForPage = collectRoleAgencyIds(items)
  const agencyRows = agencyIdsForPage.length > 0
    ? await db
        .selectFrom('Agency_Profile')
        .where('Agency_Profile.id', 'in', agencyIdsForPage)
        .where('Agency_Profile._deleted', '=', false)
        .select([
          'Agency_Profile.id as id',
          'Agency_Profile.egcs_ay_name_en as name_en',
          'Agency_Profile.egcs_ay_name_fr as name_fr'
        ])
        .execute()
    : []

  const rolesWithAbilities = attachRoleListDetails(
    items,
    abilitiesByRoleId,
    transferPaymentsByRoleId,
    mapRoleAgenciesById(agencyRows)
  )
  const filteredTotal = countResult?.total
  const unfilteredTotal = statsResult?.total

  return {
    items: rolesWithAbilities,
    total: filteredTotal === undefined || filteredTotal === null ? 0 : Number(filteredTotal),
    stats: {
      total: unfilteredTotal === undefined || unfilteredTotal === null ? 0 : Number(unfilteredTotal),
      active: unfilteredTotal === undefined || unfilteredTotal === null ? 0 : Number(unfilteredTotal)
    },
    page,
    limit
  }
}
