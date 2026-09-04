import { sql } from 'kysely'
import { z } from 'zod'
import { authorize } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import { PaginationSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

const QuerySchema = PaginationSchema.extend({
  permission_action: z.enum(['create', 'update']).default('create')
})

const readRoute = defineEventHandler(async event => {
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
    .selectFrom('Transfer_Payment_Stream_Budget')
    .innerJoin(
      'Transfer_Payment_Fiscal_Year_Budget',
      'Transfer_Payment_Fiscal_Year_Budget.id',
      'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget'
    )
    .innerJoin('Funding_Case_Agreement_Profile', join =>
      join.on('Funding_Case_Agreement_Profile.id', '=', agreementId)
    )
    .innerJoin(
      'Agency_Fiscal_Year',
      'Agency_Fiscal_Year.id',
      'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear'
    )
    .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream', '=', agreementContext.streamId)
    .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
    .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
    .where('Agency_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Profile._deleted', '=', false)
    .whereRef('Agency_Fiscal_Year.egcs_ay_startdate', '<=', 'Funding_Case_Agreement_Profile.egcs_fc_authorizedassistanceenddate')
    .whereRef('Agency_Fiscal_Year.egcs_ay_enddate', '>=', 'Funding_Case_Agreement_Profile.egcs_fc_authorizedassistancestartdate')

  if (search) {
    const escapedSearch = escapeLikePattern(search)
    baseQuery = baseQuery.where(eb => eb.or([
      eb(sql<string>`CAST("Agency_Fiscal_Year"."id" AS TEXT)`, '=', search),
      eb('Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay', 'ilike', `%${escapedSearch}%`),
      eb(sql<string>`CAST("Agency_Fiscal_Year"."egcs_ay_fiscalyear" AS TEXT)`, 'ilike', `%${escapedSearch}%`)
    ]))
  }

  const [items, totalResult] = await Promise.all([
    baseQuery
      .select([
        'Agency_Fiscal_Year.id as id',
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as label_en',
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as label_fr',
        'Agency_Fiscal_Year.egcs_ay_fiscalyear as sort_year'
      ])
      .distinct()
      .orderBy('sort_year', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery.select(sql<number>`count(distinct "Agency_Fiscal_Year"."id")`.as('total')).executeTakeFirst()
  ])

  const total = Number(totalResult?.total || 0)

  return {
    items: items.map(({ sort_year: _sortYear, ...item }) => item),
    total,
    stats: { total, active: total },
    page,
    limit
  }
})

export default defineEventHandler(async event =>
  await executeFreshReadSnapshot(event, async () => await readRoute(event)))
