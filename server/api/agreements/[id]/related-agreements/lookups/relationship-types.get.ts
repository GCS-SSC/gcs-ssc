import { defineEventHandler, getRouterParam } from 'h3'
import { z } from 'zod'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { badRequest } from '~~/server/utils/api-errors'
import { escapeLikePattern } from '~~/server/utils/sql-like'

const QuerySchema = PaginationSchema.extend({
  permission_action: z.enum(['create', 'update']).default('create'),
  selected_ids: z.union([PositivePostgresBigintIdSchema, z.array(PositivePostgresBigintIdSchema).max(100)]).optional()
})

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  return await executeFreshReadSnapshot(event, async (db, freshAuthContext) => {
    const { page, limit, search, permission_action, selected_ids } = await getValidatedQueryI18n(event, QuerySchema)
    const context = await authorizeAgreementResource(event, permission_action, agreementId, db, { freshAuth: true, freshAuthContext })
    if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    let query = db.selectFrom('Agency_Agreement_Relationship_Type')
      .where('egcs_ay_organizationagency', '=', context.agencyId).where('_deleted', '=', false)
    if (selected_ids) query = query.where('id', 'in', Array.isArray(selected_ids) ? selected_ids : [selected_ids])
    if (search) {
      const pattern = `%${escapeLikePattern(search)}%`
      query = query.where(eb => eb.or([eb('egcs_ay_typename_en', 'ilike', pattern), eb('egcs_ay_typename_fr', 'ilike', pattern)]))
    }
    const [items, count] = await Promise.all([
      query.select(['id', 'egcs_ay_typename_en as label_en', 'egcs_ay_typename_fr as label_fr'])
        .orderBy('id').limit(limit).offset((page - 1) * limit).execute(),
      query.select(eb => eb.fn.count('id').as('total')).executeTakeFirstOrThrow()
    ])
    return { items, total: Number(count.total), page, limit }
  })
})
