import { badRequest } from '~~/server/utils/api-errors'
import { PaginationSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertAgreementExists } from '~~/server/utils/agreement-child-resources'
import { AGREEMENT_ADDRESS_SELECT_COLUMNS } from '~~/server/utils/agreement-address-columns'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')

  if (!agreementId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  return await executeFreshReadSnapshot(event, async db => {
    const agreementContext = await authorizeAgreementResource(event, 'read', agreementId, db, { freshAuth: true })
    if (!agreementContext) {
      return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    }

    const agreement = await assertAgreementExists(event, agreementId, db)
    if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) {
      return agreement
    }

    const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
    const offset = (page - 1) * limit

    let baseQuery = db
      .selectFrom('Funding_Case_Agreement_Address')
      .innerJoin('Common_Address', 'Common_Address.id', 'Funding_Case_Agreement_Address.egcs_fc_address')
      .innerJoin('Agency_Address_Type', 'Agency_Address_Type.id', 'Funding_Case_Agreement_Address.egcs_fc_addresstype')
      .where('Funding_Case_Agreement_Address.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Address._deleted', '=', false)
      .where('Common_Address._deleted', '=', false)
      .where('Agency_Address_Type._deleted', '=', false)

    if (search) {
      const escapedSearch = escapeLikePattern(search)
      baseQuery = baseQuery.where(eb => eb.or([
        eb('Common_Address.egcs_cn_addresscity', 'ilike', `%${escapedSearch}%`),
        eb('Common_Address.egcs_cn_addresssubdivision', 'ilike', `%${escapedSearch}%`),
        eb('Common_Address.egcs_cn_postalcodezipcode', 'ilike', `%${escapedSearch}%`),
        eb('Common_Address.egcs_cn_street1', 'ilike', `%${escapedSearch}%`),
        eb('Common_Address.egcs_cn_street2', 'ilike', `%${escapedSearch}%`),
        eb('Common_Address.egcs_cn_street3', 'ilike', `%${escapedSearch}%`),
        eb('Agency_Address_Type.egcs_ay_typename_en', 'ilike', `%${escapedSearch}%`),
        eb('Agency_Address_Type.egcs_ay_typename_fr', 'ilike', `%${escapedSearch}%`)
      ]))
    }

    const [items, totalResult] = await Promise.all([
      baseQuery
        .select(AGREEMENT_ADDRESS_SELECT_COLUMNS)
        .orderBy('Funding_Case_Agreement_Address.id', 'asc')
        .limit(limit)
        .offset(offset)
        .execute(),
      baseQuery.select(eb => eb.fn.count('Funding_Case_Agreement_Address.id').as('total')).executeTakeFirst()
    ])

    const total = Number(totalResult?.total || 0)

    return {
      items,
      total,
      stats: {
        total,
        active: total
      },
      page,
      limit
    }
  })
})
