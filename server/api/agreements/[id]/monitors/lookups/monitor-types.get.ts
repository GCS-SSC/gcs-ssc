import { z } from 'zod'
import { PaginationSchema } from '~~/shared/types/schemas'
import { prepareAgreementMonitorRoute } from '~~/server/utils/agreement-monitor'

const QuerySchema = PaginationSchema.extend({
  monitorId: z.union([z.string().min(1), z.number()]).transform(String).optional(),
  permission_action: z.enum(['create', 'update']).default('create')
}).superRefine((query, ctx) => {
  if (query.permission_action === 'update' && !query.monitorId) {
    ctx.addIssue({ code: 'custom', path: ['monitorId'], message: 'validation.required' })
  }
})

export default defineEventHandler(async event => {
  const query = await getValidatedQueryI18n(event, QuerySchema)
  let assignmentTarget
  if (query.monitorId) assignmentTarget = { entityType: 'fundingcasemonitor' as const, entityId: query.monitorId }
  const prepared = await prepareAgreementMonitorRoute(event, query.permission_action, assignmentTarget)
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementContext, db } = prepared
  const page = query.page ?? 1
  const limit = query.limit ?? 25
  const search = query.search?.trim() ?? ''
  const baseQuery = db
    .selectFrom('Transfer_Payment_Monitor_Type')
    .where('egcs_tp_transferpaymentstream', '=', agreementContext.streamId)
    .where('_deleted', '=', false)
    .$if(search.length > 0, qb => qb.where(eb => eb.or([
      eb('egcs_tp_name_en', 'ilike', `%${search}%`),
      eb('egcs_tp_name_fr', 'ilike', `%${search}%`)
    ])))

  const [items, countResult] = await Promise.all([
    baseQuery.select(['id', 'egcs_tp_name_en as label_en', 'egcs_tp_name_fr as label_fr']).orderBy('egcs_tp_name_en', 'asc').limit(limit).offset((page - 1) * limit).execute(),
    baseQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst()
  ])

  const total = Number(countResult?.total ?? 0)
  return { items, total, stats: { total, active: total }, page, limit }
})
