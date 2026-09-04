import { z } from 'zod'
import { sql } from 'kysely'
import { badRequest } from '~~/server/utils/api-errors'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertAgreementExists } from '~~/server/utils/agreement-child-resources'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

const QuerySchema = PaginationSchema.extend({
  permission_action: z.enum(['create', 'update']).default('create'),
  ids: z.union([
    PositivePostgresBigintIdSchema,
    z.array(PositivePostgresBigintIdSchema).max(100, { error: 'validation.invalid_selection' })
  ]).optional()
})

/**
 * Normalizes optional selected lookup ids for hydration queries.
 *
 * @param value - One selected id or the repeated-query id list.
 * @returns Selected ids as an array.
 */
const normalizeQueryIds = (value?: string | string[]) => {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')

  if (!agreementId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  return await executeFreshReadSnapshot(event, async db => {
    const { page, limit, search, permission_action, ids } = await getValidatedQueryI18n(event, QuerySchema)
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
      .selectFrom('Transfer_Payment_Outcome')
      .where('Transfer_Payment_Outcome.egcs_tp_transferpaymentprofile', '=', agreementContext.profileId)
      .where('Transfer_Payment_Outcome._deleted', '=', false)
    const selectedIds = normalizeQueryIds(ids)

    if (selectedIds.length > 0) {
      baseQuery = baseQuery.where('Transfer_Payment_Outcome.id', 'in', selectedIds)
    }

    if (search) {
      const escapedSearch = escapeLikePattern(search)
      baseQuery = baseQuery.where(eb => eb.or([
        eb(sql<string>`CAST(${sql.ref('Transfer_Payment_Outcome.id')} AS TEXT)`, '=', escapedSearch),
        eb('Transfer_Payment_Outcome.egcs_tp_name_en', 'ilike', `%${escapedSearch}%`),
        eb('Transfer_Payment_Outcome.egcs_tp_name_fr', 'ilike', `%${escapedSearch}%`),
        eb('Transfer_Payment_Outcome.egcs_tp_description_en', 'ilike', `%${escapedSearch}%`),
        eb('Transfer_Payment_Outcome.egcs_tp_description_fr', 'ilike', `%${escapedSearch}%`)
      ]))
    }

    const [items, totalResult] = await Promise.all([
      baseQuery
        .select([
          'Transfer_Payment_Outcome.id as id',
          'Transfer_Payment_Outcome.egcs_tp_name_en as label_en',
          'Transfer_Payment_Outcome.egcs_tp_name_fr as label_fr',
          'Transfer_Payment_Outcome.egcs_tp_description_en as description_en',
          'Transfer_Payment_Outcome.egcs_tp_description_fr as description_fr'
        ])
        .orderBy('Transfer_Payment_Outcome.egcs_tp_name_en', 'asc')
        .orderBy('Transfer_Payment_Outcome.id', 'asc')
        .limit(limit)
        .offset(offset)
        .execute(),
      baseQuery.select(eb => eb.fn.count('Transfer_Payment_Outcome.id').as('total')).executeTakeFirst()
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
