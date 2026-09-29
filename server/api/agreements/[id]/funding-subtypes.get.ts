import { z } from 'zod'
import { sql } from 'kysely'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { badRequest } from '~~/server/utils/api-errors'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { authorize } from '~~/server/utils/authorize'
import { canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { escapeLikePattern } from '~~/server/utils/sql-like'

const QuerySchema = PaginationSchema.extend({
  selected_ids: z.preprocess(value => value === undefined ? undefined : Array.isArray(value) ? value : [value],
    z.array(PositivePostgresBigintIdSchema).max(100).optional())
})

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const agreementContext = await resolveAgreementScopeContext(agreementId, db)
  if (!agreementContext) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  await authorize(event, 'agreement', 'read', async ({ context }) => {
    if (await canAccessAgreement(context, 'read', agreementContext.scope, db)) return { bypass: true }
    return { denied: true }
  })

  const { page, limit, search, selected_ids: selectedIds } = await getValidatedQueryI18n(event, QuerySchema)
  let query = db.selectFrom('Transfer_Payment_Stream_Funding_Subtype as link')
    .innerJoin('Agency_Funding_Subtype as subtype', 'subtype.id', 'link.egcs_tp_fundingsubtype')
    .innerJoin('Agency_Funding_Type as type', 'type.id', 'subtype.egcs_ay_fundingtype')
    .innerJoin('Transfer_Payment_Stream as stream', 'stream.id', 'link.egcs_tp_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile as profile', 'profile.id', 'stream.egcs_tp_transferpaymentprofile')
    .where('link.egcs_tp_transferpaymentstream', '=', agreementContext.streamId)
    .where('link._deleted', '=', false)
    .where('subtype._deleted', '=', false)
    .where('type._deleted', '=', false)
    .where('subtype.egcs_ay_active', '=', true)
    .where('type.egcs_ay_active', '=', true)
    .whereRef('type.egcs_ay_organizationagency', '=', 'profile.egcs_tp_agency')
  if (selectedIds?.length) query = query.where('subtype.id', 'in', selectedIds)
  if (search) {
    const escaped = escapeLikePattern(search)
    query = query.where(eb => eb.or([
      eb('subtype.egcs_ay_name_en', 'ilike', `%${escaped}%`),
      eb('subtype.egcs_ay_name_fr', 'ilike', `%${escaped}%`),
      eb('type.egcs_ay_name_en', 'ilike', `%${escaped}%`),
      eb('type.egcs_ay_name_fr', 'ilike', `%${escaped}%`)
    ]))
  }
  const [items, count] = await Promise.all([
    query.select([
      'subtype.id as id',
      sql<string>`"type"."egcs_ay_name_en" || ' / ' || "subtype"."egcs_ay_name_en"`.as('label_en'),
      sql<string>`"type"."egcs_ay_name_fr" || ' / ' || "subtype"."egcs_ay_name_fr"`.as('label_fr'),
      'type.egcs_ay_name_en as type_name_en',
      'type.egcs_ay_name_fr as type_name_fr',
      'type.egcs_ay_instacking as instacking',
      'type.egcs_ay_incostsharing as incostsharing'
    ]).orderBy('type.egcs_ay_name_en').orderBy('subtype.egcs_ay_name_en').orderBy('subtype.id')
      .limit(limit).offset((page - 1) * limit).execute(),
    query.select(eb => eb.fn.count('subtype.id').as('total')).executeTakeFirst()
  ])
  const total = Number(count?.total ?? 0)
  return { items, total, stats: { total, active: total }, page, limit }
})
