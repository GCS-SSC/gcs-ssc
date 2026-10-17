import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { sql } from 'kysely'
import { z } from 'zod'
import { badRequest } from '~~/server/utils/api-errors'
import { PaginationSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeAgreementResource, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

const QuerySchema = PaginationSchema.extend({
  selected_ids: z.preprocess(value => value === undefined ? undefined : Array.isArray(value) ? value : [value], z.array(PositivePostgresBigintIdSchema).max(100).optional()),
  permission_action: z.enum(['create', 'update']).default('create'),
  amendment_id: PositivePostgresBigintIdSchema.optional()
})

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')

  if (!agreementId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  return await executeFreshReadSnapshot(event, async db => {
    const agreementContext = await resolveAgreementScopeContext(agreementId, db)
    if (!agreementContext) {
      return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    }

    const { page, limit, search, permission_action, amendment_id, selected_ids } = await getValidatedQueryI18n(event, QuerySchema)
    const authorizedContext = await authorizeAgreementResource(event, permission_action, agreementId, db, {
      freshAuth: true,
      assignmentTarget: amendment_id ? { entityType: 'fundingcaseamendment', entityId: amendment_id } : undefined
    })
    if (!authorizedContext) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

    const offset = (page - 1) * limit

    let baseQuery = db
      .selectFrom('Transfer_Payment_Stream_Cost_Category_Line_Item')
      .innerJoin(
        'Agency_Cost_Category_Line_Item',
        'Agency_Cost_Category_Line_Item.id',
        'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_organizationcostcategory'
      )
      .innerJoin('Agency_Cost_Category', 'Agency_Cost_Category.id', 'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory')
      .where('Agency_Cost_Category._deleted', '=', false)
      .where('Agency_Cost_Category.egcs_ay_active', '=', true)
      .where('Agency_Cost_Category_Line_Item.egcs_ay_active', '=', true)
      .where('Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_active', '=', true)
      .where('Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_transferpaymentstream', '=', authorizedContext.streamId)
      .where('Transfer_Payment_Stream_Cost_Category_Line_Item._deleted', '=', false)
      .where('Agency_Cost_Category_Line_Item._deleted', '=', false)

    if (selected_ids?.length) baseQuery = baseQuery.where('Transfer_Payment_Stream_Cost_Category_Line_Item.id', 'in', selected_ids)

    if (search) {
      const escapedSearch = escapeLikePattern(search)
      baseQuery = baseQuery.where(eb => eb.or([
        eb('Agency_Cost_Category_Line_Item.egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
        eb('Agency_Cost_Category_Line_Item.egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`)
      ]))
    }

    const [items, totalResult] = await Promise.all([
      baseQuery
        .select([
          'Transfer_Payment_Stream_Cost_Category_Line_Item.id as id',
          'Agency_Cost_Category_Line_Item.egcs_ay_name_en as label_en',
          'Agency_Cost_Category_Line_Item.egcs_ay_calculationmode',
          sql<string | null>`(SELECT source.egcs_ay_name_en FROM "Agency_Cost_Category" source WHERE source.id = "Agency_Cost_Category_Line_Item".egcs_ay_sourcecategory)`.as('calculation_source_name_en'),
          sql<string | null>`(SELECT source.egcs_ay_name_fr FROM "Agency_Cost_Category" source WHERE source.id = "Agency_Cost_Category_Line_Item".egcs_ay_sourcecategory)`.as('calculation_source_name_fr'),
          'Agency_Cost_Category_Line_Item.egcs_ay_sourcecategory',
          'Agency_Cost_Category_Line_Item.egcs_ay_percentage',
          'Agency_Cost_Category_Line_Item.egcs_ay_allowpercentageoverride',
          'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory as calculation_category_id',
          'Agency_Cost_Category_Line_Item.egcs_ay_name_fr as label_fr'
        ])
        .orderBy('Agency_Cost_Category_Line_Item.egcs_ay_calculationmode', 'desc')
        .orderBy('Agency_Cost_Category_Line_Item.egcs_ay_name_en', 'asc')
        .orderBy('Agency_Cost_Category_Line_Item.id', 'asc')
        .limit(limit)
        .offset(offset)
        .execute(),
      baseQuery.select(eb => eb.fn.count('Transfer_Payment_Stream_Cost_Category_Line_Item.id').as('total')).executeTakeFirst()
    ])

    const total = Number(totalResult?.total || 0)

    return { items, total, stats: { total, active: total }, page, limit }
  })
})
