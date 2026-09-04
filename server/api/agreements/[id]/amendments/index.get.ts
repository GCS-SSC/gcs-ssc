import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { PaginationSchema } from '~~/shared/types/schemas'
import { isAgreementAmendable } from '~~/server/utils/agreement-amendment'
import { getAgreementAmendmentBudgetDifferences } from '~~/server/utils/agreement-amendment-budget-difference'
import { withBusinessRecordState } from '~~/server/utils/business-record-state'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const agreementContext = await authorizeAgreementResource(event, 'read', agreementId, db)
  if (!agreementContext) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  const { page, limit } = await getValidatedQueryI18n(event, PaginationSchema)
  const base = db.selectFrom('Funding_Case_Agreement_Amendment')
    .where('egcs_fc_fundingagreement', '=', agreementId).where('_deleted', '=', false)
  const [rows, count, openAmendment, agreementAmendable] = await Promise.all([
    base.selectAll().orderBy('egcs_fc_amendmentnumber', 'desc').orderBy('id', 'desc').limit(limit).offset((page - 1) * limit).execute(),
    base.select(eb => eb.fn.count('id').as('total')).executeTakeFirst(),
    base.select('id').where('egcs_fc_isopen', '=', true).executeTakeFirst(),
    isAgreementAmendable(db, agreementId)
  ])
  const ids = rows.map(row => String(row.id))
  const [typeRows, budgetVersions, activityVersions, budgetDifferences] = ids.length === 0
    ? [[], [], [], new Map()]
    : await Promise.all([
        db.selectFrom('Funding_Case_Agreement_Amendment_Type')
          .innerJoin('Transfer_Payment_Amendment_Type', 'Transfer_Payment_Amendment_Type.id', 'Funding_Case_Agreement_Amendment_Type.egcs_fc_amendmenttype')
          .select(['Funding_Case_Agreement_Amendment_Type.egcs_fc_amendment as amendment_id', 'Transfer_Payment_Amendment_Type.id as id', 'Transfer_Payment_Amendment_Type.egcs_tp_amended as egcs_tp_amended', 'Transfer_Payment_Amendment_Type.egcs_tp_name_en as egcs_tp_name_en', 'Transfer_Payment_Amendment_Type.egcs_tp_name_fr as egcs_tp_name_fr'])
          .where('Funding_Case_Agreement_Amendment_Type.egcs_fc_amendment', 'in', ids).where('Funding_Case_Agreement_Amendment_Type._deleted', '=', false).execute(),
        db.selectFrom('Funding_Case_Agreement_Budget_Version').select('egcs_fc_amendment').where('egcs_fc_amendment', 'in', ids).where('_deleted', '=', false).execute(),
        db.selectFrom('Funding_Case_Agreement_Activity_Version').select('egcs_fc_amendment').where('egcs_fc_amendment', 'in', ids).where('_deleted', '=', false).execute(),
        getAgreementAmendmentBudgetDifferences(db, agreementId, ids)
      ])
  const budgetIds = new Set(budgetVersions.map(row => String(row.egcs_fc_amendment)))
  const activityIds = new Set(activityVersions.map(row => String(row.egcs_fc_amendment)))
  const total = Number(count?.total ?? 0)
  const items = await withBusinessRecordState(db, 'fundingcaseamendment', rows.map(row => ({
    ...row,
    amendment_types: typeRows.filter(type => String(type.amendment_id) === String(row.id)),
    amendment_type_ids: typeRows.filter(type => String(type.amendment_id) === String(row.id)).map(type => String(type.id)),
    has_budget_snapshot: budgetIds.has(String(row.id)),
    has_activity_snapshot: activityIds.has(String(row.id)),
    budget_differences: budgetDifferences.get(String(row.id)) ?? []
  })))
  return {
    items,
    total,
    stats: { total, active: total },
    can_create: agreementAmendable && !openAmendment,
    page,
    limit
  }
})
