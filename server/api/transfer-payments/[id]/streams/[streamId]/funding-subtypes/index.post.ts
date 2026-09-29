import { StreamFundingSubtypeSchema } from '~~/shared/types/schemas/funding-sources'
import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'

// eslint-disable-next-line local/require-authorize -- delegated to authorizeTransferPaymentStreamResource
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const context = await authorizeTransferPaymentStreamResource(event, 'create', profileId, streamId)
  if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  const body = await readValidatedBodyI18n(event, StreamFundingSubtypeSchema)
  try {
    return await executeFreshAuthorizedTransferPaymentStreamWrite(event, db, profileId, context.agencyId, streamId, 'create', async (trx, fresh) => {
      const source = await trx.selectFrom('Agency_Funding_Subtype as subtype')
        .innerJoin('Agency_Funding_Type as type', 'type.id', 'subtype.egcs_ay_fundingtype')
        .select('subtype.id').where('subtype.id', '=', body.egcs_tp_fundingsubtype)
        .where('subtype._deleted', '=', false).where('subtype.egcs_ay_active', '=', true)
        .where('type._deleted', '=', false).where('type.egcs_ay_active', '=', true)
        .where('type.egcs_ay_organizationagency', '=', fresh.agencyId).executeTakeFirst()
      if (!source) return await badRequest(event, 'INVALID_FUNDING_SUBTYPE', 'apiErrors.transfer_payment.invalid_funding_subtype')
      const existing = await trx.selectFrom('Transfer_Payment_Stream_Funding_Subtype').select(['id', '_deleted'])
        .where('egcs_tp_transferpaymentstream', '=', streamId).where('egcs_tp_fundingsubtype', '=', body.egcs_tp_fundingsubtype)
        .orderBy('id', 'desc').forUpdate().executeTakeFirst()
      if (existing && !existing._deleted) return await badRequest(event, 'DUPLICATE_FUNDING_SUBTYPE', 'apiErrors.transfer_payment.duplicate_funding_subtype')
      if (existing) return await trx.updateTable('Transfer_Payment_Stream_Funding_Subtype').set({ _deleted: false })
        .where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow()
      return await trx.insertInto('Transfer_Payment_Stream_Funding_Subtype')
        .values({ egcs_tp_transferpaymentstream: streamId, egcs_tp_fundingsubtype: body.egcs_tp_fundingsubtype })
        .returningAll().executeTakeFirstOrThrow()
    })
  } catch (error: unknown) {
    await throwIfTransferPaymentUniqueConstraintError(event, error)
    throw error
  }
})
