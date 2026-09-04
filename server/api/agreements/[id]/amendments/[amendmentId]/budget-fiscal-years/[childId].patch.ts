import { badRequest, notFound } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertDraftAgreementAmendmentCapability, resolveDraftAgreementAmendmentBudgetVersion } from '~~/server/utils/agreement-amendment'
import { FundingCaseAgreementBudgetFiscalYearPatchSchema } from '~~/shared/types/schemas'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { assertFiscalYearOverlapsAmendmentDuration } from '~~/server/utils/agreement-fiscal-year-duration'
import { budgetFiscalYearStableId } from '~~/server/utils/agreement-budget-lineage'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id'), amendmentId = getRouterParam(event, 'amendmentId'), childId = getRouterParam(event, 'childId')
  if (!agreementId || !amendmentId || !childId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(childId)) return await notFound(event, 'AGREEMENT_BUDGET_FISCAL_YEAR_NOT_FOUND', 'apiErrors.agreement.budget_fiscal_year_not_found')
  const context = await authorizeAgreementResource(event, 'update', agreementId, db)
  if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  const body = await readValidatedBodyI18n(event, FundingCaseAgreementBudgetFiscalYearPatchSchema)
  try {
    return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async trx => {
      const draftAmendment = await assertDraftAgreementAmendmentCapability(event, trx, agreementId, amendmentId, ['budget', 'duration'])
      if (!('id' in draftAmendment)) return draftAmendment
      const versionId = await resolveDraftAgreementAmendmentBudgetVersion(event, trx, agreementId, amendmentId)
      if (typeof versionId !== 'string') return versionId
      const existing = await trx.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year').selectAll().where(budgetFiscalYearStableId, '=', childId)
        .where('egcs_fc_budgetversion', '=', versionId).where('_deleted', '=', false).executeTakeFirst()
      if (!existing) return await notFound(event, 'AGREEMENT_BUDGET_FISCAL_YEAR_NOT_FOUND', 'apiErrors.agreement.budget_fiscal_year_not_found')
      if (!body.egcs_fc_fiscalyear) return { ...existing, id: existing.egcs_fc_originalbudgetfiscalyear ?? existing.id }
      const fiscalYear = await trx.selectFrom('Transfer_Payment_Stream_Budget')
        .innerJoin('Transfer_Payment_Fiscal_Year_Budget', 'Transfer_Payment_Fiscal_Year_Budget.id', 'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget')
        .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear')
        .select(['Agency_Fiscal_Year.id', 'Agency_Fiscal_Year.egcs_ay_startdate', 'Agency_Fiscal_Year.egcs_ay_enddate'])
        .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream', '=', context.streamId)
        .where('Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear', '=', body.egcs_fc_fiscalyear)
        .where('Transfer_Payment_Stream_Budget._deleted', '=', false).where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
        .where('Agency_Fiscal_Year._deleted', '=', false).executeTakeFirst()
      if (!fiscalYear) return await badRequest(event, 'INVALID_AGREEMENT_BUDGET_FISCAL_YEAR', 'apiErrors.agreement.invalid_budget_fiscal_year')
      const durationError = await assertFiscalYearOverlapsAmendmentDuration(event, trx, amendmentId, fiscalYear)
      if (durationError) return durationError
      const updated = await trx.updateTable('Funding_Case_Agreement_Budget_Fiscal_Year').set({ egcs_fc_fiscalyear: body.egcs_fc_fiscalyear })
        .where('id', '=', String(existing.id)).where('egcs_fc_budgetversion', '=', versionId).where('_deleted', '=', false).returningAll().executeTakeFirstOrThrow()
      return { ...updated, id: updated.egcs_fc_originalbudgetfiscalyear ?? updated.id }
    }, {
      action: 'update',
      assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId },
      businessStatusTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }
    })
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
})
