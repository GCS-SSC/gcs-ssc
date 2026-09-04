import { z } from 'zod'
import { authorize } from '~~/server/utils/authorize'
import { buildListRouteResponse } from '~~/server/utils/list-route-response'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { PaginationSchema, RequiredStringId } from '~~/shared/types/schemas'

const AgencyGwcoaLookupQuerySchema = PaginationSchema.extend({
  agency_id: RequiredStringId().optional(),
  permission_action: z.enum(['create', 'update']).default('create')
}).superRefine((value, context) => {
  if (value.permission_action === 'update' && value.agency_id === undefined) {
    context.addIssue({ code: 'custom', path: ['agency_id'], message: 'validation.id_required' })
  }
})

export default defineEventHandler(async event => {
  const db = event.context.$db
  const query = await getValidatedQueryI18n(event, AgencyGwcoaLookupQuerySchema)
  if (query.permission_action === 'update' && query.agency_id !== undefined) {
    await authorize(event, 'agency', 'update', { type: 'agency', agencyId: query.agency_id })
  } else {
    await authorize(event, 'agency', 'create', { type: 'global' })
  }

  const offset = (query.page - 1) * query.limit
  let baseQuery = db.selectFrom('Common_GWCOA').where('_deleted', '=', false)
  if (query.search) {
    const search = escapeLikePattern(query.search)
    baseQuery = baseQuery.where(eb => eb.or([
      eb('egcs_cn_name_en', 'ilike', `%${search}%`),
      eb('egcs_cn_name_fr', 'ilike', `%${search}%`),
      eb(eb.cast('egcs_cn_number', 'text'), 'ilike', `%${search}%`)
    ]))
  }

  const [items, count] = await Promise.all([
    baseQuery.select(['egcs_cn_number', 'egcs_cn_name_en', 'egcs_cn_name_fr'])
      .orderBy('egcs_cn_number', 'asc').limit(query.limit).offset(offset).execute(),
    baseQuery.select(eb => eb.fn.count('egcs_cn_number').as('total')).executeTakeFirst()
  ])

  return buildListRouteResponse(items, count, count, query.page, query.limit)
})
