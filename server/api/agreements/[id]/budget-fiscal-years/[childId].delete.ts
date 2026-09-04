import { authorize } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import { canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import {
  AGREEMENT_CHILD_ERROR_KEYS,
  assertAgreementChildExists
} from '~~/server/utils/agreement-child-resources'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { budgetFiscalYearStableId, budgetLineItemStableId } from '~~/server/utils/agreement-budget-lineage'
import { sql } from 'kysely'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const childId = getRouterParam(event, 'childId')

  if (!agreementId || !childId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(childId)) {
    return await badRequest(event, 'AGREEMENT_BUDGET_FISCAL_YEAR_NOT_FOUND', 'apiErrors.agreement.budget_fiscal_year_not_found')
  }

  const agreementContext = await resolveAgreementScopeContext(agreementId, db)
  if (!agreementContext) {
    return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  await authorize(event, 'agreement', 'delete', async ({ context }) => {
    const canDelete = await canAccessAgreement(context, 'delete', agreementContext.scope, db)
    if (canDelete) return { bypass: true }
    return { denied: true }
  })

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async trx => {
    const existing = await assertAgreementChildExists(
      event,
      trx
        .selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
        .innerJoin(
          'Funding_Case_Agreement_Budget_Version',
          'Funding_Case_Agreement_Budget_Version.id',
          'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion'
        )
        .where(sql<string>`${budgetFiscalYearStableId}::text`, '=', childId)
        .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
        .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
        .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
        .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
        .select([
          'Funding_Case_Agreement_Budget_Fiscal_Year.id as id',
          budgetFiscalYearStableId.as('stable_id')
        ])
        .forUpdate('Funding_Case_Agreement_Budget_Fiscal_Year')
        .executeTakeFirst(),
      ...AGREEMENT_CHILD_ERROR_KEYS.budgetFiscalYearNotFound
    )
    if (!existing || typeof existing !== 'object' || !('id' in existing)) {
      return existing
    }

    const activeClaim = await trx
      .selectFrom('Funding_Case_Agreement_Claim')
      .where('egcs_fc_fiscalyear', '=', existing.stable_id)
      .where('_deleted', '=', false)
      .select('id')
      .executeTakeFirst()

    const activePayment = await trx
      .selectFrom('Funding_Case_Agreement_Payment')
      .where('egcs_fc_fiscalyear', '=', existing.stable_id)
      .where('_deleted', '=', false)
      .select('id')
      .executeTakeFirst()

    const activeClaimLine = await trx
      .selectFrom('Funding_Case_Agreement_Budget_Line_Item')
      .innerJoin('Funding_Case_Agreement_Claim_Line_Item', join => join.on(
        'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementbudgetlineitem',
        '=',
        budgetLineItemStableId
      ))
      .innerJoin(
        'Funding_Case_Agreement_Claim',
        'Funding_Case_Agreement_Claim.id',
        'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementclaim'
      )
      .where('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear', '=', String(existing.id))
      .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim_Line_Item._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim._deleted', '=', false)
      .select('Funding_Case_Agreement_Claim_Line_Item.id')
      .executeTakeFirst()

    if (activeClaim || activePayment || activeClaimLine) {
      return await badRequest(
        event,
        'AGREEMENT_BUDGET_FISCAL_YEAR_FINANCIAL_RECORDS_IN_USE',
        'apiErrors.agreement.budget_fiscal_year_financial_records_in_use'
      )
    }

    const activeLineItem = await trx
      .selectFrom('Funding_Case_Agreement_Budget_Line_Item')
      .where('egcs_fc_fundingagreementbudgetfiscalyear', '=', String(existing.id))
      .where('_deleted', '=', false)
      .select('id')
      .executeTakeFirst()

    if (activeLineItem) {
      return await badRequest(event, 'AGREEMENT_BUDGET_FISCAL_YEAR_IN_USE', 'apiErrors.agreement.budget_fiscal_year_in_use')
    }

    await trx
      .updateTable('Funding_Case_Agreement_Budget_Fiscal_Year')
      .set({ _deleted: true })
      .where('id', '=', String(existing.id))
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .executeTakeFirst()

    return { success: true }
  }, { action: 'delete', blocksApprovalSubmission: true })
})
