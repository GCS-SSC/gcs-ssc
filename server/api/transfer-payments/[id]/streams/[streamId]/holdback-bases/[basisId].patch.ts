import { TransferPaymentStreamHoldbackBasisSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const basisId = getRouterParam(event, 'basisId')
  if (!profileId || !streamId || !basisId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(basisId)) return await notFound(event, 'HOLDBACK_BASIS_NOT_FOUND', 'apiErrors.transfer_payment.holdback_basis_not_found')
  const context = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', context.scope, db))
  const body = await readValidatedBodyI18n(event, TransferPaymentStreamHoldbackBasisSchema.partial())
  if (Object.keys(body).length === 0) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }
  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, context.agencyId, streamId, 'update', async (trx, freshContext) => {
      const current = await trx.selectFrom('Transfer_Payment_Stream_Holdback_Basis').select('id')
        .where('id', '=', basisId).where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false).forUpdate().executeTakeFirst()
      if (!current) return await notFound(event, 'HOLDBACK_BASIS_NOT_FOUND', 'apiErrors.transfer_payment.holdback_basis_not_found')
      if (body.egcs_tp_agencyholdback) {
        const valid = await trx.selectFrom('Agency_Holdback_Basis').select('id').where('id', '=', body.egcs_tp_agencyholdback)
          .where('egcs_ay_organizationagency', '=', freshContext.agencyId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
        if (!valid) return await badRequest(event, 'INVALID_HOLDBACK_BASIS', 'apiErrors.transfer_payment.invalid_holdback_basis')
      }
      return await trx.updateTable('Transfer_Payment_Stream_Holdback_Basis').set(body)
        .where('id', '=', basisId).where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false).returningAll().executeTakeFirstOrThrow()
    }
  )
})
