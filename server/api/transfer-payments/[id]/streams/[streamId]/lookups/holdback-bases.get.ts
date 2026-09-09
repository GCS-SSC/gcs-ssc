import { PaginationSchema } from '~~/shared/types/schemas'
import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { escapeLikePattern } from '~~/server/utils/sql-like'

const HoldbackBasisLookupQuerySchema = PaginationSchema.extend({
  search: PaginationSchema.shape.search.refine(value => value === undefined || !value.includes('\u0000'), {
    error: 'validation.invalid_text_character'
  })
})

// eslint-disable-next-line local/require-authorize -- delegated to authorizeTransferPaymentStreamResource inside the fresh snapshot
export default defineEventHandler(async event => {
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')

  return await executeFreshReadSnapshot(event, async db => {
    const access = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
    if (!access) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
    const agency = await db.selectFrom('Agency_Profile').select('id')
      .where('id', '=', access.agencyId).where('_deleted', '=', false).executeTakeFirst()
    if (!agency) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')

    const { page, limit, search } = await getValidatedQueryI18n(event, HoldbackBasisLookupQuerySchema)
    let baseQuery = db.selectFrom('Agency_Holdback_Basis')
      .where('egcs_ay_organizationagency', '=', access.agencyId).where('_deleted', '=', false)
    if (search) {
      const escapedSearch = escapeLikePattern(search)
      baseQuery = baseQuery.where(eb => eb.or([
        eb('egcs_ay_languageindependentcode', 'ilike', `%${escapedSearch}%`),
        eb('egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
        eb('egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`)
      ]))
    }
    const [items, count] = await Promise.all([
      baseQuery.select(['id', 'egcs_ay_organizationagency', 'egcs_ay_languageindependentcode', 'egcs_ay_name_en', 'egcs_ay_name_fr', '_deleted'])
        .orderBy('id', 'asc').limit(limit).offset((page - 1) * limit).execute(),
      baseQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst()
    ])
    const total = Number(count?.total ?? 0)
    return { items, total, stats: { total, active: total }, page, limit }
  })
})
