import { badRequest, notFound } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertDraftAgreementAmendmentCapability, resolveDraftAgreementAmendmentBudgetVersion } from '~~/server/utils/agreement-amendment'
import { FundingCaseAgreementBudgetLineItemPatchSchema } from '~~/shared/types/schemas'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { budgetFiscalYearStableId, budgetLineItemStableId } from '~~/server/utils/agreement-budget-lineage'
import { validateMergedBudgetLineItemFundingPatch } from '~~/server/utils/agreement-financial-patch-validation'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'
import { sql } from 'kysely'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id'), amendmentId = getRouterParam(event, 'amendmentId'), childId = getRouterParam(event, 'childId')
  if (!agreementId || !amendmentId || !childId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(childId)) return await notFound(event, 'AGREEMENT_BUDGET_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.budget_line_item_not_found')
  const context = await authorizeAgreementResource(event, 'update', agreementId, db)
  if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  const body = await readValidatedBodyI18n(event, FundingCaseAgreementBudgetLineItemPatchSchema)
  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async trx => {
    const amendment = await assertDraftAgreementAmendmentCapability(event, trx, agreementId, amendmentId, ['budget'])
    if (!('id' in amendment)) return amendment
    const versionId = await resolveDraftAgreementAmendmentBudgetVersion(event, trx, agreementId, amendmentId)
    if (typeof versionId !== 'string') return versionId
    const existing = await trx.selectFrom('Funding_Case_Agreement_Budget_Line_Item')
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year', 'Funding_Case_Agreement_Budget_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear')
      .select([
        'Funding_Case_Agreement_Budget_Line_Item.id as id',
        budgetLineItemStableId.as('stable_id'),
        budgetFiscalYearStableId.as('stable_fiscal_year_id'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_totalamount')).as('egcs_fc_totalamount'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_programfunding')).as('egcs_fc_programfunding'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_otherfederalfunding')).as('egcs_fc_otherfederalfunding'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_othergovfunding')).as('egcs_fc_othergovfunding'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_otherfunding')).as('egcs_fc_otherfunding')
      ]).where(budgetLineItemStableId, '=', childId)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion', '=', versionId)
      .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
      .forUpdate('Funding_Case_Agreement_Budget_Line_Item')
      .executeTakeFirst()
    if (!existing) return await notFound(event, 'AGREEMENT_BUDGET_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.budget_line_item_not_found')
    await validateMergedBudgetLineItemFundingPatch(event, existing, body)
    let targetFiscalYearRowId: string | undefined
    if (body.egcs_fc_fundingagreementbudgetfiscalyear) {
      const year = await trx.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year').select('id').where(budgetFiscalYearStableId, '=', body.egcs_fc_fundingagreementbudgetfiscalyear)
        .where('egcs_fc_budgetversion', '=', versionId).where('_deleted', '=', false).executeTakeFirst()
      if (!year) return await notFound(event, 'AGREEMENT_BUDGET_FISCAL_YEAR_NOT_FOUND', 'apiErrors.agreement.budget_fiscal_year_not_found')
      targetFiscalYearRowId = String(year.id)
      if (String(body.egcs_fc_fundingagreementbudgetfiscalyear) !== String(existing.stable_fiscal_year_id)) {
        const claimLine = await trx.selectFrom('Funding_Case_Agreement_Claim_Line_Item')
          .innerJoin('Funding_Case_Agreement_Claim', 'Funding_Case_Agreement_Claim.id', 'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementclaim')
          .select('Funding_Case_Agreement_Claim_Line_Item.id')
          .where('Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementbudgetlineitem', '=', String(existing.stable_id))
          .where('Funding_Case_Agreement_Claim_Line_Item._deleted', '=', false).where('Funding_Case_Agreement_Claim._deleted', '=', false).executeTakeFirst()
        if (claimLine) return await badRequest(event, 'AGREEMENT_BUDGET_LINE_ITEM_CLAIM_MOVE_NOT_ALLOWED', 'apiErrors.agreement.budget_line_item_claim_move_not_allowed')
      }
    }
    if (body.egcs_fc_organizationcostcategory) {
      const category = await trx.selectFrom('Transfer_Payment_Stream_Cost_Category_Line_Item').select('id').where('id', '=', body.egcs_fc_organizationcostcategory)
        .where('egcs_tp_transferpaymentstream', '=', context.streamId).where('_deleted', '=', false)
        .forUpdate().executeTakeFirst()
      if (!category) return await badRequest(event, 'INVALID_AGREEMENT_BUDGET_LINE_ITEM', 'apiErrors.agreement.invalid_cost_category_line_item')
    }
    const updateValues = targetFiscalYearRowId
      ? { ...body, egcs_fc_fundingagreementbudgetfiscalyear: targetFiscalYearRowId }
      : body
    const {
      egcs_fc_totalamount,
      egcs_fc_programfunding,
      egcs_fc_otherfederalfunding,
      egcs_fc_othergovfunding,
      egcs_fc_otherfunding,
      ...nonMoneyUpdateValues
    } = updateValues
    const updated = await trx.updateTable('Funding_Case_Agreement_Budget_Line_Item').set({
      ...nonMoneyUpdateValues,
      ...(egcs_fc_totalamount === undefined ? {} : { egcs_fc_totalamount: databaseMoneyValue(egcs_fc_totalamount) }),
      ...(egcs_fc_programfunding === undefined ? {} : { egcs_fc_programfunding: databaseMoneyValue(egcs_fc_programfunding) }),
      ...(egcs_fc_otherfederalfunding === undefined ? {} : { egcs_fc_otherfederalfunding: databaseMoneyValue(egcs_fc_otherfederalfunding) }),
      ...(egcs_fc_othergovfunding === undefined ? {} : { egcs_fc_othergovfunding: databaseMoneyValue(egcs_fc_othergovfunding) }),
      ...(egcs_fc_otherfunding === undefined ? {} : { egcs_fc_otherfunding: databaseMoneyValue(egcs_fc_otherfunding) })
    }).where('id', '=', String(existing.id)).where('_deleted', '=', false).returning([
      'id', 'egcs_fc_originalbudgetlineitem',
      databaseMoneyText(sql.ref('egcs_fc_totalamount')).as('egcs_fc_totalamount'),
      databaseMoneyText(sql.ref('egcs_fc_programfunding')).as('egcs_fc_programfunding'),
      databaseMoneyText(sql.ref('egcs_fc_otherfederalfunding')).as('egcs_fc_otherfederalfunding'),
      databaseMoneyText(sql.ref('egcs_fc_othergovfunding')).as('egcs_fc_othergovfunding'),
      databaseMoneyText(sql.ref('egcs_fc_otherfunding')).as('egcs_fc_otherfunding')
    ]).executeTakeFirstOrThrow()
    const fiscalYearIdentity = body.egcs_fc_fundingagreementbudgetfiscalyear
      ? String(body.egcs_fc_fundingagreementbudgetfiscalyear)
      : String(existing.stable_fiscal_year_id)
    return {
      ...updated,
      egcs_fc_totalamount: parseDatabaseMoney(updated.egcs_fc_totalamount),
      egcs_fc_programfunding: parseDatabaseMoney(updated.egcs_fc_programfunding),
      egcs_fc_otherfederalfunding: updated.egcs_fc_otherfederalfunding === null ? null : parseDatabaseMoney(updated.egcs_fc_otherfederalfunding),
      egcs_fc_othergovfunding: updated.egcs_fc_othergovfunding === null ? null : parseDatabaseMoney(updated.egcs_fc_othergovfunding),
      egcs_fc_otherfunding: updated.egcs_fc_otherfunding === null ? null : parseDatabaseMoney(updated.egcs_fc_otherfunding),
      id: updated.egcs_fc_originalbudgetlineitem ?? updated.id,
      egcs_fc_fundingagreementbudgetfiscalyear: fiscalYearIdentity,
      fiscal_year_id: fiscalYearIdentity
    }
  }, {
    action: 'update',
    assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId },
    businessStatusTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }
  })
})
