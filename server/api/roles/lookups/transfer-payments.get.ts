import { PositivePostgresBigintIdSchema, TransferPaymentListQuerySchema } from '~~/shared/types/schemas'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { RoleIdSchema } from '~~/shared/types/schemas/rbac'
import { authorize, requireAuthContext, resolveRoleScope } from '~~/server/utils/authorize'
import { listRoleLookupTransferPayments } from '~~/server/utils/role-lookup-routes'

const RoleTransferPaymentLookupQuerySchema = TransferPaymentListQuerySchema.extend({
  agency_id: PositivePostgresBigintIdSchema.optional(),
  role_id: RoleIdSchema.optional()
})

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const query = await getValidatedQueryI18n(event, RoleTransferPaymentLookupQuerySchema)
  let agencyId: string

  if (query.role_id !== undefined) {
    const { data: role } = await authorize(event, 'role', 'update', resolveRoleScope(query.role_id, db))
    if (!role?.agency_id) {
      return { items: [], total: 0, page: query.page, limit: query.limit }
    }
    agencyId = String(role.agency_id)
  } else {
    if (query.agency_id === undefined) {
      return await badRequest(event, 'MISSING_AGENCY_ID', 'apiErrors.request.missing_agency_id')
    }
    agencyId = query.agency_id
    await authorize(event, 'role', 'create', { type: 'agency', agencyId })
  }

  return await listRoleLookupTransferPayments(db, agencyId, query)
})
