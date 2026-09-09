import { z } from 'zod'
import { badRequest } from '~~/server/utils/api-errors'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertAgreementExists } from '~~/server/utils/agreement-child-resources'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

const QuerySchema = PaginationSchema.extend({
  permission_action: z.enum(['create', 'update']).default('create'),
  address_id: PositivePostgresBigintIdSchema.optional(),
  selected_ids: z.union([
    PositivePostgresBigintIdSchema,
    z.array(PositivePostgresBigintIdSchema).max(100, { error: 'validation.invalid_selection' })
  ]).optional()
})

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')

  if (!agreementId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  return await executeFreshReadSnapshot(event, async db => {
    const { page, limit, search, permission_action, address_id, selected_ids } = await getValidatedQueryI18n(event, QuerySchema)
    const agreementContext = await authorizeAgreementResource(event, permission_action, agreementId, db, { freshAuth: true })
    if (!agreementContext) {
      return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    }

    const offset = (page - 1) * limit

    const agreement = await assertAgreementExists(event, agreementId, db)
    if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) {
      return agreement
    }

    let baseQuery = db
      .selectFrom('Agency_Address_Type')
      .where('egcs_ay_organizationagency', '=', agreementContext.agencyId)
    const selectedIds = selected_ids ? (Array.isArray(selected_ids) ? selected_ids : [selected_ids]) : []

    if (selectedIds.length > 0) {
      baseQuery = baseQuery.where('Agency_Address_Type.id', 'in', selectedIds)
    }
    if (selectedIds.length > 0 && permission_action === 'update' && address_id) {
      // Historical labels belong only to the exact selected reference of this
      // Agreement address. Supplying address_id never broadens ordinary browse.
      baseQuery = baseQuery.where(eb => eb.or([
        eb('Agency_Address_Type._deleted', '=', false),
        eb.exists(eb.selectFrom('Funding_Case_Agreement_Address')
          .innerJoin('Common_Address', 'Common_Address.id', 'Funding_Case_Agreement_Address.egcs_fc_address')
          .select('Funding_Case_Agreement_Address.id')
          .where('Funding_Case_Agreement_Address.id', '=', address_id)
          .where('Funding_Case_Agreement_Address.egcs_fc_fundingagreement', '=', agreementId)
          .where('Funding_Case_Agreement_Address._deleted', '=', false)
          .where('Common_Address._deleted', '=', false)
          .whereRef('Funding_Case_Agreement_Address.egcs_fc_addresstype', '=', 'Agency_Address_Type.id'))
      ]))
    } else {
      baseQuery = baseQuery.where('Agency_Address_Type._deleted', '=', false)
    }

    if (search) {
      const escapedSearch = escapeLikePattern(search)
      baseQuery = baseQuery.where(eb => {
        const predicates = [
          eb('egcs_ay_typename_en', 'ilike', `%${escapedSearch}%`),
          eb('egcs_ay_typename_fr', 'ilike', `%${escapedSearch}%`)
        ]
        if (isPositivePostgresBigintText(search)) predicates.push(eb('id', '=', search))
        return eb.or(predicates)
      })
    }

    const [items, totalResult] = await Promise.all([
      baseQuery
        .select([
          'id',
          'egcs_ay_typename_en as label_en',
          'egcs_ay_typename_fr as label_fr'
        ])
        .orderBy('id', 'asc')
        .limit(limit)
        .offset(offset)
        .execute(),
      baseQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst()
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
