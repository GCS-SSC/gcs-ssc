import { z } from 'zod'
import { badRequest } from '~~/server/utils/api-errors'
import { PaginationSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertAgreementExists } from '~~/server/utils/agreement-child-resources'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

const QuerySchema = PaginationSchema.extend({
  permission_action: z.enum(['create', 'update']).default('create')
})

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')

  if (!agreementId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  return await executeFreshReadSnapshot(event, async db => {
    const { page, limit, search, permission_action } = await getValidatedQueryI18n(event, QuerySchema)
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
      .where('_deleted', '=', false)

    if (search) {
      const escapedSearch = escapeLikePattern(search)
      baseQuery = baseQuery.where(eb => eb.or([
        eb('id', '=', escapedSearch),
        eb('egcs_ay_typename_en', 'ilike', `%${escapedSearch}%`),
        eb('egcs_ay_typename_fr', 'ilike', `%${escapedSearch}%`)
      ]))
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
