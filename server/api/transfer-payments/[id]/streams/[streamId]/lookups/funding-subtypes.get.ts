import { PaginationSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'
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
    const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
    let query = db.selectFrom('Agency_Funding_Subtype as subtype')
      .innerJoin('Agency_Funding_Type as type', 'type.id', 'subtype.egcs_ay_fundingtype')
      .where('type.egcs_ay_organizationagency', '=', context.agencyId)
      .where('type._deleted', '=', false).where('subtype._deleted', '=', false)
      .where('type.egcs_ay_active', '=', true).where('subtype.egcs_ay_active', '=', true)
      .where(eb => eb.not(eb.exists(eb.selectFrom('Transfer_Payment_Stream_Funding_Subtype as link')
        .select('link.id').whereRef('link.egcs_tp_fundingsubtype', '=', 'subtype.id')
        .where('link.egcs_tp_transferpaymentstream', '=', streamId).where('link._deleted', '=', false))))
    if (search) {
      const pattern = `%${escapeLikePattern(search)}%`
      query = query.where(eb => eb.or([
        eb('subtype.egcs_ay_name_en', 'ilike', pattern), eb('subtype.egcs_ay_name_fr', 'ilike', pattern),
        eb('type.egcs_ay_name_en', 'ilike', pattern), eb('type.egcs_ay_name_fr', 'ilike', pattern)
      ]))
    }
    const [items, count] = await Promise.all([
      query.select(['subtype.id', 'subtype.egcs_ay_name_en', 'subtype.egcs_ay_name_fr',
        'type.egcs_ay_name_en as type_name_en', 'type.egcs_ay_name_fr as type_name_fr'])
        .orderBy('type.egcs_ay_name_en').orderBy('subtype.egcs_ay_name_en')
        .limit(limit).offset((page - 1) * limit).execute(),
      query.select(eb => eb.fn.count('subtype.id').as('total')).executeTakeFirst()
    ])
    return { items, total: Number(count?.total ?? 0), page, limit }
  })
})
