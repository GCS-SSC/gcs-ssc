import { defineEventHandler } from 'h3'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { z } from 'zod'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { prepareAgreementMonitorRoute } from '~~/server/utils/agreement-monitor'

const QuerySchema = PaginationSchema.extend({
  monitorId: PositivePostgresBigintIdSchema.optional(),
  selected_ids: z.preprocess(value => value === undefined ? undefined : Array.isArray(value) ? value : [value],
    z.array(PositivePostgresBigintIdSchema).min(1).max(100).optional()),
  permission_action: z.enum(['create', 'update']).default('create')
}).superRefine((query, ctx) => {
  if (query.permission_action === 'update' && !query.monitorId) {
    ctx.addIssue({ code: 'custom', path: ['monitorId'], message: 'validation.required' })
  }
})

const readRoute = defineEventHandler(async event => {
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
  const search = query.selected_ids ? '' : query.search?.trim() ?? ''
  const baseQuery = db
    .selectFrom('Transfer_Payment_Monitor_Type')
    .innerJoin('Agency_Monitor_Type', 'Agency_Monitor_Type.id', 'Transfer_Payment_Monitor_Type.egcs_tp_agencymonitortype')
    .where('Transfer_Payment_Monitor_Type.egcs_tp_transferpaymentstream', '=', agreementContext.streamId)
    .where('Transfer_Payment_Monitor_Type._deleted', '=', false)
    .where('Agency_Monitor_Type._deleted', '=', false)
    .$if(Boolean(query.selected_ids), qb => qb.where('Transfer_Payment_Monitor_Type.id', 'in', query.selected_ids ?? []))
    .$if(search.length > 0, qb => qb.where(eb => eb.or([
      eb('Agency_Monitor_Type.egcs_ay_name_en', 'ilike', `%${escapeLikePattern(search)}%`),
      eb('Agency_Monitor_Type.egcs_ay_name_fr', 'ilike', `%${escapeLikePattern(search)}%`)
    ])))

  const [items, countResult] = await Promise.all([
    baseQuery.select(['Transfer_Payment_Monitor_Type.id as id', 'Agency_Monitor_Type.egcs_ay_name_en as label_en', 'Agency_Monitor_Type.egcs_ay_name_fr as label_fr']).orderBy('Agency_Monitor_Type.egcs_ay_name_en', 'asc').orderBy('Transfer_Payment_Monitor_Type.id', 'asc').limit(limit).offset((page - 1) * limit).execute(),
    baseQuery.select(eb => eb.fn.count('Transfer_Payment_Monitor_Type.id').as('total')).executeTakeFirst()
  ])

  const total = Number(countResult?.total ?? 0)
  return { items, total, stats: { total, active: total }, page, limit }
})

export default defineEventHandler(async event => await executeFreshReadSnapshot(event, async () => await readRoute(event)))
