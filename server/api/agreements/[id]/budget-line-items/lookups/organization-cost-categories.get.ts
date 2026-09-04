import { z } from 'zod'
import { authorize } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import { PaginationSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'

const QuerySchema = PaginationSchema.extend({
  permission_action: z.enum(['create', 'update']).default('create')
})

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')

  if (!agreementId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const agreementContext = await resolveAgreementScopeContext(agreementId, db)
  if (!agreementContext) {
    return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  const { page, limit, search, permission_action } = await getValidatedQueryI18n(event, QuerySchema)
  await authorize(event, 'agreement', permission_action, async ({ context }) => {
    const canAccess = await canAccessAgreement(context, permission_action, agreementContext.scope, db)
    if (canAccess) return { bypass: true }
    return { denied: true }
  })

  const offset = (page - 1) * limit

  let baseQuery = db
    .selectFrom('Transfer_Payment_Stream_Cost_Category_Line_Item')
    .innerJoin(
      'Agency_Cost_Category_Line_Item',
      'Agency_Cost_Category_Line_Item.id',
      'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_organizationcostcategory'
    )
    .where('Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_transferpaymentstream', '=', agreementContext.streamId)
    .where('Transfer_Payment_Stream_Cost_Category_Line_Item._deleted', '=', false)
    .where('Agency_Cost_Category_Line_Item._deleted', '=', false)

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
        'Agency_Cost_Category_Line_Item.egcs_ay_name_fr as label_fr'
      ])
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
