import { sql } from 'kysely'
import { badRequest } from '~~/server/utils/api-errors'
import { PaginationSchema } from '~~/shared/types/schemas'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertDraftAgreementAmendmentCapability } from '~~/server/utils/agreement-amendment'
import { resolveAgreementAmendmentEffectiveDuration } from '~~/server/utils/agreement-fiscal-year-duration'
import { escapeLikePattern } from '~~/server/utils/sql-like'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const amendmentId = getRouterParam(event, 'amendmentId')
  if (!agreementId || !amendmentId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')

  const context = await authorizeAgreementResource(event, 'read', agreementId, db, {
    assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }
  })
  if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  const draftAmendment = await assertDraftAgreementAmendmentCapability(event, db, agreementId, amendmentId, ['budget', 'duration'])
  if (!('id' in draftAmendment)) return draftAmendment

  const amendmentDuration = await resolveAgreementAmendmentEffectiveDuration(db, amendmentId)

  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  let query = db.selectFrom('Transfer_Payment_Stream_Budget')
    .innerJoin('Transfer_Payment_Fiscal_Year_Budget', 'Transfer_Payment_Fiscal_Year_Budget.id', 'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget')
    .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear')
    .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream', '=', context.streamId)
    .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
    .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
    .where('Agency_Fiscal_Year._deleted', '=', false)
    .where('Agency_Fiscal_Year.egcs_ay_startdate', '<=', amendmentDuration.endDate)
    .where('Agency_Fiscal_Year.egcs_ay_enddate', '>=', amendmentDuration.startDate)

  if (search) {
    const escapedSearch = escapeLikePattern(search)
    query = query.where(eb => eb.or([
      eb(sql<string>`CAST("Agency_Fiscal_Year"."id" AS TEXT)`, '=', search),
      eb('Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay', 'ilike', `%${escapedSearch}%`),
      eb(sql<string>`CAST("Agency_Fiscal_Year"."egcs_ay_fiscalyear" AS TEXT)`, 'ilike', `%${escapedSearch}%`)
    ]))
  }

  const [items, count] = await Promise.all([
    query.select([
      'Agency_Fiscal_Year.id as id',
      'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as label_en',
      'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as label_fr',
      'Agency_Fiscal_Year.egcs_ay_fiscalyear as sort_year'
    ]).distinct().orderBy('sort_year', 'asc').limit(limit).offset((page - 1) * limit).execute(),
    query.select(sql<number>`count(distinct "Agency_Fiscal_Year"."id")`.as('total')).executeTakeFirst()
  ])
  const total = Number(count?.total ?? 0)
  return { items: items.map(({ sort_year: _sortYear, ...item }) => item), total, stats: { total, active: total }, page, limit }
})
