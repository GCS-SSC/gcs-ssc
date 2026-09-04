import { PaginationSchema } from '~~/shared/types/schemas'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { RoleIdSchema } from '~~/shared/types/schemas/rbac'
import { authorize, requireAuthContext, resolveAnyAgency, resolveRoleScope } from '~~/server/utils/authorize'
import { listRoleLookupAgencies } from '~~/server/utils/role-lookup-routes'

const RoleAgencyLookupQuerySchema = PaginationSchema.extend({
  role_id: RoleIdSchema.optional()
})

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const query = await getValidatedQueryI18n(event, RoleAgencyLookupQuerySchema)

  if (query.role_id !== undefined) {
    const { data: role } = await authorize(event, 'role', 'update', resolveRoleScope(query.role_id, db))
    if (!role?.agency_id) {
      return { items: [], total: 0, page: query.page, limit: query.limit }
    }

    return await listRoleLookupAgencies(db, [String(role.agency_id)], query)
  }

  const authContext = await authorize(event, 'role', 'create', resolveAnyAgency(db))
  const hasGlobalAccess = authContext.hasGlobalAccess === true
  const authorizedAgencyIds = authContext.agencyIds
  return await listRoleLookupAgencies(
    db,
    hasGlobalAccess
      ? null
      : authorizedAgencyIds === undefined ? [] : authorizedAgencyIds,
    query
  )
})
