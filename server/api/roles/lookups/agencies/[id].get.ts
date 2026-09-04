import { z } from 'zod'
import { getValidatedQueryI18n, parseI18n } from '~~/server/utils/api-validate'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { RoleIdSchema } from '~~/shared/types/schemas/rbac'
import { authorizeWithFreshAuthContext, requireAuthContext, requireFreshAuthContext, resolveRoleScope } from '~~/server/utils/authorize'

const RoleAgencyDetailLookupQuerySchema = z.object({
  role_id: RoleIdSchema.optional()
})

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const agencyIdParam = getRouterParam(event, 'id')
  if (!agencyIdParam) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  const query = await getValidatedQueryI18n(event, RoleAgencyDetailLookupQuerySchema)
  return await db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx)
    let roleAgencyId: string | null = null
    if (query.role_id !== undefined) {
      const { data: role } = await authorizeWithFreshAuthContext(event, authContext, 'role', 'update', resolveRoleScope(query.role_id, trx))
      roleAgencyId = role?.agency_id ? String(role.agency_id) : null
    } else {
      await authorizeWithFreshAuthContext(event, authContext, 'role', 'create', { type: 'agency', agencyId: agencyIdParam })
    }

    const agencyId = await parseI18n(event, PositivePostgresBigintIdSchema, agencyIdParam)
    if (query.role_id !== undefined && roleAgencyId !== agencyId) {
      return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
    }
    const agency = await trx.selectFrom('Agency_Profile').where('id', '=', agencyId).where('_deleted', '=', false)
      .select(['id', 'egcs_ay_name_en', 'egcs_ay_name_fr']).executeTakeFirst()
    return agency ?? await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  })
})
