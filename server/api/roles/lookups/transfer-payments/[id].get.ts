import { z } from 'zod'
import { getValidatedQueryI18n, parseI18n } from '~~/server/utils/api-validate'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { RoleIdSchema } from '~~/shared/types/schemas/rbac'
import { authorizeWithFreshAuthContext, requireAuthContext, requireFreshAuthContext, resolveRoleScope } from '~~/server/utils/authorize'

const RoleTransferPaymentDetailLookupQuerySchema = z.object({
  agency_id: PositivePostgresBigintIdSchema.optional(),
  role_id: RoleIdSchema.optional()
})

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const transferPaymentIdParam = getRouterParam(event, 'id')
  if (!transferPaymentIdParam) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  const query = await getValidatedQueryI18n(event, RoleTransferPaymentDetailLookupQuerySchema)
  if (query.role_id === undefined && query.agency_id === undefined) {
    return await badRequest(event, 'MISSING_AGENCY_ID', 'apiErrors.request.missing_agency_id')
  }

  return await db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx)
    let agencyId: string
    if (query.role_id !== undefined) {
      const { data: role } = await authorizeWithFreshAuthContext(event, authContext, 'role', 'update', resolveRoleScope(query.role_id, trx))
      if (!role?.agency_id) return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
      agencyId = String(role.agency_id)
    } else {
      agencyId = query.agency_id!
      await authorizeWithFreshAuthContext(event, authContext, 'role', 'create', { type: 'agency', agencyId })
    }

    const transferPaymentId = await parseI18n(
      event,
      PositivePostgresBigintIdSchema,
      transferPaymentIdParam
    )
    const transferPayment = await trx
      .selectFrom('Transfer_Payment_Profile')
      .innerJoin(
        'Agency_Profile',
        'Agency_Profile.id',
        'Transfer_Payment_Profile.egcs_tp_agency'
      )
      .where('Transfer_Payment_Profile.id', '=', transferPaymentId)
      .where('Transfer_Payment_Profile.egcs_tp_agency', '=', agencyId)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .where('Agency_Profile._deleted', '=', false)
      .select([
        'Transfer_Payment_Profile.id as id',
        'Transfer_Payment_Profile.egcs_tp_agency as egcs_tp_agency',
        'Transfer_Payment_Profile.egcs_tp_name_en as egcs_tp_name_en',
        'Transfer_Payment_Profile.egcs_tp_name_fr as egcs_tp_name_fr'
      ])
      .executeTakeFirst()

    return transferPayment ?? await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
  })
})
