import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertDraftAgreementAmendmentCapability, resolveDraftAgreementAmendmentBudgetVersion } from '~~/server/utils/agreement-amendment'
import { FundingCaseAgreementBudgetFiscalYearCreateSchema } from '~~/shared/types/schemas'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { assertFiscalYearOverlapsAmendmentDuration } from '~~/server/utils/agreement-fiscal-year-duration'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const amendmentId = getRouterParam(event, 'amendmentId')
  if (!agreementId || !amendmentId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const context = await authorizeAgreementResource(event, 'create', agreementId, db)
  if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  const body = await readValidatedBodyI18n(event, FundingCaseAgreementBudgetFiscalYearCreateSchema)
  try {
    return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async trx => {
      const amendment = await assertDraftAgreementAmendmentCapability(event, trx, agreementId, amendmentId, ['budget', 'duration'])
      if (!('id' in amendment)) return amendment
      const versionId = await resolveDraftAgreementAmendmentBudgetVersion(event, trx, agreementId, amendmentId)
      if (typeof versionId !== 'string') return versionId
      const fiscalYear = await trx.selectFrom('Transfer_Payment_Stream_Budget')
        .innerJoin('Transfer_Payment_Fiscal_Year_Budget', 'Transfer_Payment_Fiscal_Year_Budget.id', 'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget')
        .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear')
        .select([
          'Agency_Fiscal_Year.id as id',
          'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display',
          'Agency_Fiscal_Year.egcs_ay_startdate',
          'Agency_Fiscal_Year.egcs_ay_enddate'
        ])
        .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream', '=', context.streamId)
        .where('Agency_Fiscal_Year.id', '=', body.egcs_fc_fiscalyear).where('Transfer_Payment_Stream_Budget._deleted', '=', false)
        .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false).where('Agency_Fiscal_Year._deleted', '=', false).executeTakeFirst()
      if (!fiscalYear) return await badRequest(event, 'INVALID_AGREEMENT_BUDGET_FISCAL_YEAR', 'apiErrors.agreement.invalid_budget_fiscal_year')
      const durationError = await assertFiscalYearOverlapsAmendmentDuration(event, trx, amendmentId, fiscalYear)
      if (durationError) return durationError
      const row = await trx.insertInto('Funding_Case_Agreement_Budget_Fiscal_Year').values({
        egcs_fc_fundingagreement: agreementId,
        egcs_fc_budgetversion: versionId,
        egcs_fc_fiscalyear: body.egcs_fc_fiscalyear
      }).returning(['id', 'egcs_fc_fiscalyear']).executeTakeFirstOrThrow()
      return { ...row, fiscal_year_display: fiscalYear.fiscal_year_display }
    }, {
      action: 'create',
      assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId },
      businessStatusTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }
    })
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
})
