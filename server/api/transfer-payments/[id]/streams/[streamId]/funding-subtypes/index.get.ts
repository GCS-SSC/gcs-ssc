import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

// eslint-disable-next-line local/require-authorize -- delegated to authorizeTransferPaymentStreamResource
export default defineEventHandler(async event => {
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  return await executeFreshReadSnapshot(event, async db => {
    const context = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
    if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
    return { items: await db.selectFrom('Transfer_Payment_Stream_Funding_Subtype as link')
      .innerJoin('Agency_Funding_Subtype as subtype', 'subtype.id', 'link.egcs_tp_fundingsubtype')
      .innerJoin('Agency_Funding_Type as type', 'type.id', 'subtype.egcs_ay_fundingtype')
      .select([
        'link.id', 'link.egcs_tp_transferpaymentstream', 'link.egcs_tp_fundingsubtype',
        'subtype.egcs_ay_name_en', 'subtype.egcs_ay_name_fr', 'subtype.egcs_ay_fundingtype',
        'type.egcs_ay_name_en as egcs_ay_type_name_en', 'type.egcs_ay_name_fr as egcs_ay_type_name_fr',
        'type.egcs_ay_instacking', 'type.egcs_ay_incostsharing'
      ])
      .where('link.egcs_tp_transferpaymentstream', '=', streamId)
      .where('link._deleted', '=', false).where('subtype._deleted', '=', false)
      .where('type._deleted', '=', false).where('type.egcs_ay_organizationagency', '=', context.agencyId)
      .orderBy('type.egcs_ay_name_en').orderBy('subtype.egcs_ay_name_en').execute() }
  })
})
