import type { Insertable } from 'kysely'
import { authorize } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import { FundingCaseAgreementBudgetFiscalYearCreateSchema } from '~~/shared/types/schemas'
import type { FundingCaseAgreementBudgetFiscalYearTable } from '~~/shared/types/database'
import { canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { assertAgreementExists } from '~~/server/utils/agreement-child-resources'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { assertFiscalYearOverlapsDuration } from '~~/server/utils/agreement-fiscal-year-duration'
import { sql } from 'kysely'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')

  if (!agreementId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const agreementContext = await resolveAgreementScopeContext(agreementId, db)
  if (!agreementContext) {
    return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  await authorize(event, 'agreement', 'create', async ({ context }) => {
    const canCreate = await canAccessAgreement(context, 'create', agreementContext.scope, db)
    if (canCreate) return { bypass: true }
    return { denied: true }
  })

  const agreement = await assertAgreementExists(event, agreementId, db)
  if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) {
    return agreement
  }

  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementBudgetFiscalYearCreateSchema)
  try {
    return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, currentContext) => {
      const fiscalYear = await trx
        .selectFrom('Transfer_Payment_Stream_Budget')
        .innerJoin(
          'Transfer_Payment_Fiscal_Year_Budget',
          'Transfer_Payment_Fiscal_Year_Budget.id',
          'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget'
        )
        .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear')
        .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream', '=', currentContext.streamId)
        .where(sql<string>`"Transfer_Payment_Fiscal_Year_Budget"."egcs_tp_fiscalyear"::text`, '=', validated.egcs_fc_fiscalyear)
        .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
        .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
        .where('Agency_Fiscal_Year._deleted', '=', false)
        .select([
          'Agency_Fiscal_Year.id as id',
          'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display',
          'Agency_Fiscal_Year.egcs_ay_startdate',
          'Agency_Fiscal_Year.egcs_ay_enddate'
        ])
        .executeTakeFirst()
      if (!fiscalYear) {
        return await badRequest(event, 'INVALID_AGREEMENT_BUDGET_FISCAL_YEAR', 'apiErrors.agreement.invalid_budget_fiscal_year')
      }
      const agreementDuration = await trx.selectFrom('Funding_Case_Agreement_Profile')
        .select(['egcs_fc_authorizedassistancestartdate as startDate', 'egcs_fc_authorizedassistanceenddate as endDate'])
        .where('id', '=', agreementId).where('_deleted', '=', false).executeTakeFirst()
      if (!agreementDuration) {
        return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
      }
      const durationError = await assertFiscalYearOverlapsDuration(event, fiscalYear, agreementDuration)
      if (durationError) return durationError

      const inserted = await trx
        .insertInto('Funding_Case_Agreement_Budget_Fiscal_Year')
        .values({
          egcs_fc_fundingagreement: agreementId,
          egcs_fc_fiscalyear: validated.egcs_fc_fiscalyear
        } satisfies Insertable<FundingCaseAgreementBudgetFiscalYearTable>)
        .returning(['id', 'egcs_fc_fiscalyear'])
        .executeTakeFirstOrThrow()

      return {
        ...inserted,
        fiscal_year_display: fiscalYear.fiscal_year_display
      }
    }, { action: 'create', blocksApprovalSubmission: true })
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
})
