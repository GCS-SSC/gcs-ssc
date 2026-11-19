import { defineEventHandler, getRouterParam } from 'h3'
import { z } from 'zod'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { eligibleAgreementClauses } from '~~/server/utils/agreement-clauses'
import { badRequest } from '~~/server/utils/api-errors'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { sql } from 'kysely'

const QuerySchema = PaginationSchema.extend({
  selected_ids: z.union([PositivePostgresBigintIdSchema, z.array(PositivePostgresBigintIdSchema).max(100)]).optional()
})

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  return await executeFreshReadSnapshot(event, async (db, freshAuthContext) => {
    const scope = await authorizeAgreementResource(event, 'create', id, db, { freshAuth: true, freshAuthContext })
    if (!scope) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    const { page, limit, search, selected_ids } = await getValidatedQueryI18n(event, QuerySchema)
    const nameEn = sql<string>`version.egcs_cn_definition ->> 'nameEn'`
    const nameFr = sql<string>`version.egcs_cn_definition ->> 'nameFr'`
    let query = eligibleAgreementClauses(db, scope.streamId, scope.agencyId).where(eb => eb.not(eb.exists(
      eb.selectFrom('Funding_Case_Agreement_Clause as selection').select('selection.id')
        .where('selection.egcs_fc_fundingagreement', '=', id)
        .whereRef('selection.egcs_fc_clause', '=', 'clause.id')
        .where('selection._deleted', '=', false)
    )))
    if (selected_ids) query = query.where('clause.id', 'in', Array.isArray(selected_ids) ? selected_ids : [selected_ids])
    if (search) {
      const pattern = `%${escapeLikePattern(search)}%`
      query = query.where(eb => eb.or([
        eb(nameEn, 'ilike', pattern), eb(nameFr, 'ilike', pattern), eb('clause.egcs_ay_languageindependentcode', 'ilike', pattern)
      ]))
    }
    const [items, count] = await Promise.all([
      query.select(['clause.id', nameEn.as('label_en'), nameFr.as('label_fr')])
        .orderBy(nameEn).orderBy('clause.id').limit(limit).offset((page - 1) * limit).execute(),
      query.select(eb => eb.fn.count('clause.id').as('total')).executeTakeFirstOrThrow()
    ])
    return { items, total: Number(count.total), page, limit }
  })
})
