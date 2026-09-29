import { requireFundingAgency, requireFundingType, withFundingAgencyRead } from '~~/server/utils/funding-source-configuration'
import { PaginationSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'

// eslint-disable-next-line local/require-authorize -- delegated to requireFundingAgency
export default defineEventHandler(async event => {
  const agencyId = await requireFundingAgency(event, 'read', getRouterParam(event, 'agencyId'))
  const typeId = getRouterParam(event, 'typeId')
  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  return await withFundingAgencyRead(event, agencyId, async db => {
    await requireFundingType(event, db, agencyId, typeId)
    let query = db.selectFrom('Agency_Funding_Subtype').where('egcs_ay_fundingtype', '=', typeId!).where('_deleted', '=', false)
    if (search) {
      const pattern = `%${escapeLikePattern(search)}%`
      query = query.where(eb => eb.or([eb('egcs_ay_name_en', 'ilike', pattern), eb('egcs_ay_name_fr', 'ilike', pattern)]))
    }
    const [items, count] = await Promise.all([
      query.selectAll().orderBy('egcs_ay_name_en').limit(limit).offset((page - 1) * limit).execute(),
      query.select(eb => eb.fn.count('id').as('total')).executeTakeFirst()
    ])
    return { items, total: Number(count?.total ?? 0), page, limit }
  })
})
