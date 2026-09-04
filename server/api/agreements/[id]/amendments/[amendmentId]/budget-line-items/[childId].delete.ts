import { badRequest, notFound } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertDraftAgreementAmendmentCapability, resolveDraftAgreementAmendmentBudgetVersion } from '~~/server/utils/agreement-amendment'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { budgetLineItemStableId } from '~~/server/utils/agreement-budget-lineage'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id'), amendmentId = getRouterParam(event, 'amendmentId'), childId = getRouterParam(event, 'childId')
  if (!agreementId || !amendmentId || !childId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(childId)) return await notFound(event, 'AGREEMENT_BUDGET_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.budget_line_item_not_found')
  const context = await authorizeAgreementResource(event, 'delete', agreementId, db)
  if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async trx => {
    const amendment = await assertDraftAgreementAmendmentCapability(event, trx, agreementId, amendmentId, ['budget'])
    if (!('id' in amendment)) return amendment
    const versionId = await resolveDraftAgreementAmendmentBudgetVersion(event, trx, agreementId, amendmentId)
    if (typeof versionId !== 'string') return versionId
    const existing = await trx.selectFrom('Funding_Case_Agreement_Budget_Line_Item')
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year', 'Funding_Case_Agreement_Budget_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear')
      .select(['Funding_Case_Agreement_Budget_Line_Item.id as id', budgetLineItemStableId.as('stable_id')]).where(budgetLineItemStableId, '=', childId)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion', '=', versionId).where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false).executeTakeFirst()
    if (!existing) return await notFound(event, 'AGREEMENT_BUDGET_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.budget_line_item_not_found')
    const activeClaimLine = await trx.selectFrom('Funding_Case_Agreement_Claim_Line_Item')
      .innerJoin('Funding_Case_Agreement_Claim', 'Funding_Case_Agreement_Claim.id', 'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementclaim')
      .select('Funding_Case_Agreement_Claim_Line_Item.id')
      .where('Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementbudgetlineitem', '=', String(existing.stable_id))
      .where('Funding_Case_Agreement_Claim_Line_Item._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim._deleted', '=', false)
      .executeTakeFirst()
    if (activeClaimLine) return await badRequest(event, 'AGREEMENT_BUDGET_LINE_ITEM_CLAIM_IN_USE', 'apiErrors.agreement.budget_line_item_claim_in_use')
    await trx.updateTable('Funding_Case_Agreement_Budget_Line_Item').set({ _deleted: true }).where('id', '=', String(existing.id)).where('_deleted', '=', false).execute()
    return { success: true }
  }, {
    action: 'delete',
    assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId },
    businessStatusTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }
  })
})
