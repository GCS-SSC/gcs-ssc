import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { AdminCommonListQuerySchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { sql } from 'kysely'

export const AmendmentTypeLookupQuerySchema = AdminCommonListQuerySchema.pick({
  page: true,
  limit: true,
  search: true,
  deleted: true
}).extend({
  amendmentId: PositivePostgresBigintIdSchema.optional()
}).strict()

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const { amendmentId, page, limit, search, deleted } = await getValidatedQueryI18n(event, AmendmentTypeLookupQuerySchema)
  let assignmentTarget
  if (amendmentId) {
    assignmentTarget = { entityType: 'fundingcaseamendment' as const, entityId: amendmentId }
  }
  const context = await authorizeAgreementResource(event, 'read', agreementId, db, { assignmentTarget })
  if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  let query = db.selectFrom('Transfer_Payment_Amendment_Type')
    .where('egcs_tp_transferpaymentstream', '=', context.streamId)

  if (deleted !== undefined) query = query.where('_deleted', '=', deleted)
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`
    query = query.where(eb => eb.or([
      eb(sql<string>`CAST(${eb.ref('id')} AS TEXT)`, 'ilike', pattern),
      eb('egcs_tp_name_en', 'ilike', pattern),
      eb('egcs_tp_name_fr', 'ilike', pattern)
    ]))
  }

  const [items, count, stats] = await Promise.all([
    query
      .select(['id', 'egcs_tp_amended', 'egcs_tp_name_en', 'egcs_tp_name_fr', 'egcs_tp_requiresamendmentsubtype'])
      .orderBy('id', 'asc')
      .limit(limit)
      .offset((page - 1) * limit)
      .execute(),
    query.select(eb => eb.fn.count('id').as('total')).executeTakeFirst(),
    db.selectFrom('Transfer_Payment_Amendment_Type')
      .select(eb => [
        eb.fn.count('id').as('total'),
        eb.fn.count('id').filterWhere('_deleted', '=', false).as('active')
      ])
      .where('egcs_tp_transferpaymentstream', '=', context.streamId)
      .executeTakeFirst()
  ])

  return {
    items,
    total: Number(count?.total ?? 0),
    stats: { total: Number(stats?.total ?? 0), active: Number(stats?.active ?? 0) },
    page,
    limit
  }
})
