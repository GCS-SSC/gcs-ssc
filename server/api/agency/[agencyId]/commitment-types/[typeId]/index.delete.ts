import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { badRequest, notFound } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  const typeId = getRouterParam(event, 'typeId')
  if (!agencyId || !typeId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(agencyId) || !isPositivePostgresBigintText(typeId)) return await notFound(event, 'COMMITMENT_TYPE_NOT_FOUND', 'apiErrors.transfer_payment.commitment_type_not_found')
  await authorize(event, 'agency', 'delete', { type: 'agency', agencyId })
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const current = await trx.selectFrom('Agency_Commitment_Type').select('id')
      .where('id', '=', typeId).where('egcs_ay_organizationagency', '=', agencyId)
      .where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!current) return await notFound(event, 'COMMITMENT_TYPE_NOT_FOUND', 'apiErrors.transfer_payment.commitment_type_not_found')
    const linked = await trx.selectFrom('Transfer_Payment_Stream_Commitment_Type').select('id')
      .where('egcs_tp_agencycommitmenttype', '=', typeId).where('_deleted', '=', false)
      .forUpdate().executeTakeFirst()
    if (linked) return await badRequest(event, 'TRANSFER_PAYMENT_COMMITMENT_TYPE_IN_USE', 'apiErrors.transfer_payment.commitment_type_in_use')
    await trx.updateTable('Agency_Commitment_Type').set({ _deleted: true }).where('id', '=', typeId).execute()
    return { success: true }
  })
})
