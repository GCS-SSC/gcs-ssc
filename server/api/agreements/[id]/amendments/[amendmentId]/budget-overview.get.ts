import { sql } from 'kysely'
import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { resolveAgreementAmendmentBudgetVersion } from '~~/server/utils/agreement-amendment'
import { budgetFiscalYearStableId, budgetLineItemStableId } from '~~/server/utils/agreement-budget-lineage'
import { getAgreementAmendmentBudgetDifferences } from '~~/server/utils/agreement-amendment-budget-difference'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const amendmentId = getRouterParam(event, 'amendmentId')
  if (!agreementId || !amendmentId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')

  const agreementContext = await authorizeAgreementResource(event, 'read', agreementId, db, {
    assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }
  })
  if (!agreementContext) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  const versionId = await resolveAgreementAmendmentBudgetVersion(event, db, agreementId, amendmentId)
  if (typeof versionId !== 'string') return versionId

  const [fiscalYears, lineItems, budgetDifferences] = await Promise.all([
    db.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
      .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
      .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion', '=', versionId)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
      .where('Agency_Fiscal_Year._deleted', '=', false)
      .select([
        budgetFiscalYearStableId.as('id'),
        'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear as egcs_fc_fiscalyear',
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display'
      ]).orderBy('Agency_Fiscal_Year.egcs_ay_fiscalyear', 'asc').execute(),
    db.selectFrom('Funding_Case_Agreement_Budget_Line_Item')
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year', 'Funding_Case_Agreement_Budget_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear')
      .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
      .innerJoin('Transfer_Payment_Stream_Cost_Category_Line_Item', 'Transfer_Payment_Stream_Cost_Category_Line_Item.id', 'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_organizationcostcategory')
      .innerJoin('Agency_Cost_Category_Line_Item', 'Agency_Cost_Category_Line_Item.id', 'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_organizationcostcategory')
      .innerJoin('Agency_Cost_Category', 'Agency_Cost_Category.id', 'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory')
      .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion', '=', versionId)
      .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
      .where('Agency_Fiscal_Year._deleted', '=', false)
      .where('Transfer_Payment_Stream_Cost_Category_Line_Item._deleted', '=', false)
      .where('Agency_Cost_Category_Line_Item._deleted', '=', false)
      .where('Agency_Cost_Category._deleted', '=', false)
      .select([
        budgetLineItemStableId.as('id'), budgetFiscalYearStableId.as('egcs_fc_fundingagreementbudgetfiscalyear'),
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_organizationcostcategory as egcs_fc_organizationcostcategory', 'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_costsubsection as egcs_fc_costsubsection',
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_description as egcs_fc_description', databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_totalamount')).as('egcs_fc_totalamount'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_programfunding')).as('egcs_fc_programfunding'), databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_otherfederalfunding')).as('egcs_fc_otherfederalfunding'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_othergovfunding')).as('egcs_fc_othergovfunding'), databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_otherfunding')).as('egcs_fc_otherfunding'),
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_currency as egcs_fc_currency', budgetFiscalYearStableId.as('fiscal_year_id'),
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display', 'Agency_Cost_Category.egcs_ay_name_en as organization_cost_category_name_en',
        'Agency_Cost_Category.egcs_ay_name_fr as organization_cost_category_name_fr', 'Agency_Cost_Category_Line_Item.egcs_ay_name_en as line_item_name_en',
        'Agency_Cost_Category_Line_Item.egcs_ay_name_fr as line_item_name_fr'
      ]).orderBy('Agency_Fiscal_Year.egcs_ay_fiscalyear', 'asc').orderBy(sql`LOWER("Agency_Cost_Category"."egcs_ay_name_en")`, 'asc').execute(),
    getAgreementAmendmentBudgetDifferences(db, agreementId, [amendmentId])
  ])
  return {
    fiscalYears,
    lineItems: lineItems.map(line => ({
      ...line,
      egcs_fc_totalamount: parseDatabaseMoney(line.egcs_fc_totalamount),
      egcs_fc_programfunding: parseDatabaseMoney(line.egcs_fc_programfunding),
      egcs_fc_otherfederalfunding: line.egcs_fc_otherfederalfunding === null ? null : parseDatabaseMoney(line.egcs_fc_otherfederalfunding),
      egcs_fc_othergovfunding: line.egcs_fc_othergovfunding === null ? null : parseDatabaseMoney(line.egcs_fc_othergovfunding),
      egcs_fc_otherfunding: line.egcs_fc_otherfunding === null ? null : parseDatabaseMoney(line.egcs_fc_otherfunding)
    })),
    budget_differences: budgetDifferences.get(amendmentId) ?? []
  }
})
