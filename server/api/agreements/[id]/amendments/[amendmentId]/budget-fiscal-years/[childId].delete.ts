import { badRequest, notFound } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertDraftAgreementAmendmentCapability, resolveDraftAgreementAmendmentBudgetVersion } from '~~/server/utils/agreement-amendment'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { budgetFiscalYearStableId } from '~~/server/utils/agreement-budget-lineage'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id'), amendmentId = getRouterParam(event, 'amendmentId'), childId = getRouterParam(event, 'childId')
  if (!agreementId || !amendmentId || !childId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(childId)) return await notFound(event, 'AGREEMENT_BUDGET_FISCAL_YEAR_NOT_FOUND', 'apiErrors.agreement.budget_fiscal_year_not_found')
  const context = await authorizeAgreementResource(event, 'delete', agreementId, db)
  if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async trx => {
    const amendment = await assertDraftAgreementAmendmentCapability(event, trx, agreementId, amendmentId, ['budget', 'duration'])
    if (!('id' in amendment)) return amendment
    const versionId = await resolveDraftAgreementAmendmentBudgetVersion(event, trx, agreementId, amendmentId)
    if (typeof versionId !== 'string') return versionId
    const row = await trx.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year').select(['id', 'egcs_fc_originalbudgetfiscalyear']).where(budgetFiscalYearStableId, '=', childId).where('egcs_fc_budgetversion', '=', versionId).where('_deleted', '=', false).executeTakeFirst()
    if (!row) return await notFound(event, 'AGREEMENT_BUDGET_FISCAL_YEAR_NOT_FOUND', 'apiErrors.agreement.budget_fiscal_year_not_found')
    const [claim, payment, claimLine] = await Promise.all([
      trx.selectFrom('Funding_Case_Agreement_Claim').select('id').where('egcs_fc_fiscalyear', '=', row.egcs_fc_originalbudgetfiscalyear ?? row.id).where('_deleted', '=', false).executeTakeFirst(),
      trx.selectFrom('Funding_Case_Agreement_Payment').select('id').where('egcs_fc_fiscalyear', '=', row.egcs_fc_originalbudgetfiscalyear ?? row.id).where('_deleted', '=', false).executeTakeFirst(),
      trx.selectFrom('Funding_Case_Agreement_Budget_Line_Item')
        .innerJoin('Funding_Case_Agreement_Claim_Line_Item', 'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementbudgetlineitem', 'Funding_Case_Agreement_Budget_Line_Item.id')
        .innerJoin('Funding_Case_Agreement_Claim', 'Funding_Case_Agreement_Claim.id', 'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementclaim')
        .select('Funding_Case_Agreement_Claim_Line_Item.id')
        .where('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear', '=', String(row.id))
        .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
        .where('Funding_Case_Agreement_Claim_Line_Item._deleted', '=', false)
        .where('Funding_Case_Agreement_Claim._deleted', '=', false).executeTakeFirst()
    ])
    if (claim || payment || claimLine) return await badRequest(event, 'AGREEMENT_BUDGET_FISCAL_YEAR_FINANCIAL_RECORDS_IN_USE', 'apiErrors.agreement.budget_fiscal_year_financial_records_in_use')
    await trx.updateTable('Funding_Case_Agreement_Budget_Line_Item').set({ _deleted: true })
      .where('egcs_fc_fundingagreementbudgetfiscalyear', '=', String(row.id)).where('_deleted', '=', false).execute()
    await trx.updateTable('Funding_Case_Agreement_Budget_Fiscal_Year').set({ _deleted: true }).where('id', '=', String(row.id)).where('egcs_fc_budgetversion', '=', versionId).execute()
    return { success: true }
  }, {
    action: 'delete',
    assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId },
    businessStatusTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }
  })
})
