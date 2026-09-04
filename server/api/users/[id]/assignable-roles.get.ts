import { PaginationSchema } from '~~/shared/types/schemas'
import { authorize, requireAuthContext, resolveAuthorizedAgencyAccess, resolveUserScopes } from '~~/server/utils/authorize'
import { getActiveStructuralRoles, selectActiveStructuralRoleIds } from '~~/server/utils/active-user-scopes'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

/** Lists the minimal role records the caller may assign to the selected user. */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  await requireAuthContext(event)
  if (!isPositivePostgresBigintText(id)) return await notFound(event, 'USER_NOT_FOUND', 'apiErrors.user.not_found')

  const authContext = await authorize(
    event,
    'user',
    'read',
    resolveUserScopes(id, db)
  )
  const access = await resolveAuthorizedAgencyAccess(authContext, 'user', 'update', db)
  const target = await db.selectFrom('user').where('id', '=', id).where('_deleted', '=', false).select('id').executeTakeFirst()
  if (!target) return await notFound(event, 'USER_NOT_FOUND', 'apiErrors.user.not_found')
  const hasGlobalAccess = access.hasGlobalAccess
  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  const offset = (page - 1) * limit

  if (!hasGlobalAccess && access.agencyIds.length === 0) {
    return { items: [], total: 0, page, limit }
  }

  let rolesQuery = db
    .selectFrom('role')
    .leftJoin('Agency_Profile', join => join
      .onRef('Agency_Profile.id', '=', 'role.agency_id')
      .on('Agency_Profile._deleted', '=', false))
    .where('role.id', 'in', selectActiveStructuralRoleIds(db))
  if (!hasGlobalAccess) rolesQuery = rolesQuery.where('role.agency_id', 'in', access.agencyIds)
  if (search) {
    const searchPattern = `%${escapeLikePattern(search)}%`
    rolesQuery = rolesQuery.where(eb => eb.or([
      eb('role.name_en', 'ilike', searchPattern),
      eb('role.name_fr', 'ilike', searchPattern)
    ]))
  }

  const [items, count] = await Promise.all([
    rolesQuery
      .select([
        'role.id',
        'role.name_en',
        'role.name_fr',
        'role.agency_id',
        'Agency_Profile.egcs_ay_name_en as agency_name_en',
        'Agency_Profile.egcs_ay_name_fr as agency_name_fr'
      ])
      .orderBy('role.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    rolesQuery.select(eb => eb.fn.count('role.id').as('total')).executeTakeFirst()
  ])

  const structuralRoles = await getActiveStructuralRoles(db, items.map(item => String(item.id)))
  const scopesByRoleId = new Map(structuralRoles.map(role => [role.roleId, role.scopeType]))

  return {
    items: items.map(item => ({
      ...item,
      id: String(item.id),
      agency_id: item.agency_id == null ? null : String(item.agency_id),
      scope_type: scopesByRoleId.get(String(item.id))
    })),
    total: Number(count?.total ?? 0),
    page,
    limit
  }
})
