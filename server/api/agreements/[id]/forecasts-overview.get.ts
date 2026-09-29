import { sql } from 'kysely'
import type { H3Event } from 'h3'
import { prepareAgreementForecastRoute } from '~~/server/utils/agreement-forecast'
import { budgetFiscalYearStableId, budgetLineItemStableId } from '~~/server/utils/agreement-budget-lineage'
import { withBusinessRecordState } from '~~/server/utils/business-record-state'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { z } from 'zod'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { budgetFundingSourcesByLine, loadBudgetFundingSources } from '~~/server/utils/agreement-budget-funding'

export const ForecastOverviewQuerySchema = z.object({
  forecastId: PositivePostgresBigintIdSchema.optional()
}).strict()

/**
 * Reads a forecast overview within an already-established fresh snapshot.
 * @param event - Current request event.
 * @param forecastId - Optional forecast used to scope the overview.
 * @returns The authorized forecast overview payload or route error.
 */
const readRoute = async (event: H3Event, forecastId?: string) => {
  let assignmentTarget
  if (forecastId) {
    assignmentTarget = { entityType: 'fundingcaseforecast' as const, entityId: forecastId }
  }
  const prepared = await prepareAgreementForecastRoute(event, 'read', assignmentTarget)
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, db } = prepared

  const [forecasts, budgetLineItems, lineItems] = await Promise.all([
    db
      .selectFrom('Funding_Case_Agreement_Forecast')
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year', join => join.on(
        budgetFiscalYearStableId, '=', sql.ref('Funding_Case_Agreement_Forecast.egcs_fc_fiscalyear')
      ))
      .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
      .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
      .where('Funding_Case_Agreement_Forecast.egcs_fc_fundingagreement', '=', agreementId)
      .$if(Boolean(forecastId), query => query.where('Funding_Case_Agreement_Forecast.id', '=', forecastId!))
      .where('Funding_Case_Agreement_Forecast._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
      .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
      .where('Agency_Fiscal_Year._deleted', '=', false)
      .select([
        'Funding_Case_Agreement_Forecast.id as id',
        'Funding_Case_Agreement_Forecast.egcs_fc_fundingagreement as egcs_fc_fundingagreement',
        'Funding_Case_Agreement_Forecast.egcs_fc_fiscalyear as egcs_fc_fiscalyear',
        'Funding_Case_Agreement_Forecast.egcs_fc_status as egcs_fc_status',
        'Funding_Case_Agreement_Forecast.egcs_fc_active as egcs_fc_active',
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display'
      ])
      .orderBy('Agency_Fiscal_Year.egcs_ay_fiscalyear', 'asc')
      .orderBy('Funding_Case_Agreement_Forecast.id', 'asc')
      .execute(),
    db
      .selectFrom('Funding_Case_Agreement_Budget_Line_Item')
      .innerJoin(
        'Funding_Case_Agreement_Budget_Fiscal_Year',
        'Funding_Case_Agreement_Budget_Fiscal_Year.id',
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear'
      )
      .innerJoin(
        'Funding_Case_Agreement_Budget_Version',
        'Funding_Case_Agreement_Budget_Version.id',
        'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion'
      )
      .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
      .$if(Boolean(forecastId), query => query.innerJoin('Funding_Case_Agreement_Forecast as Forecast_Context', join => join
        .on(budgetFiscalYearStableId, '=', sql.ref('Forecast_Context.egcs_fc_fiscalyear'))
        .on('Forecast_Context.id', '=', forecastId!)
        .on('Forecast_Context._deleted', '=', false)))
      .innerJoin(
        'Transfer_Payment_Stream_Cost_Category_Line_Item',
        'Transfer_Payment_Stream_Cost_Category_Line_Item.id',
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_organizationcostcategory'
      )
      .innerJoin(
        'Agency_Cost_Category_Line_Item',
        'Agency_Cost_Category_Line_Item.id',
        'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_organizationcostcategory'
      )
      .innerJoin(
        'Agency_Cost_Category',
        'Agency_Cost_Category.id',
        'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory'
      )
      .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
      .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
      .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
      .where('Agency_Fiscal_Year._deleted', '=', false)
      .where('Transfer_Payment_Stream_Cost_Category_Line_Item._deleted', '=', false)
      .where('Agency_Cost_Category_Line_Item._deleted', '=', false)
      .where('Agency_Cost_Category._deleted', '=', false)
      .select([
        budgetLineItemStableId.as('id'),
        'Funding_Case_Agreement_Budget_Line_Item.id as budget_row_id',
        budgetFiscalYearStableId.as('egcs_fc_fundingagreementbudgetfiscalyear'),
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_organizationcostcategory as egcs_fc_organizationcostcategory',
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_costsubsection as egcs_fc_costsubsection',
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_description as egcs_fc_description',
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_totalamount')).as('egcs_fc_totalamount'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_programfunding')).as('egcs_fc_programfunding'),
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_currency as egcs_fc_currency',
        budgetFiscalYearStableId.as('fiscal_year_id'),
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display',
        'Agency_Cost_Category.egcs_ay_name_en as organization_cost_category_name_en',
        'Agency_Cost_Category.egcs_ay_name_fr as organization_cost_category_name_fr',
        'Agency_Cost_Category_Line_Item.egcs_ay_name_en as line_item_name_en',
        'Agency_Cost_Category_Line_Item.egcs_ay_name_fr as line_item_name_fr'
      ])
      .orderBy('Agency_Fiscal_Year.egcs_ay_fiscalyear', 'asc')
      .orderBy(sql`LOWER("Agency_Cost_Category"."egcs_ay_name_en")`, 'asc')
      .orderBy('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_costsubsection', 'asc')
      .orderBy(sql`LOWER("Agency_Cost_Category_Line_Item"."egcs_ay_name_en")`, 'asc')
      .execute(),
    db
      .selectFrom('Funding_Case_Agreement_Forecast_Line_Item')
      .innerJoin(
        'Funding_Case_Agreement_Forecast',
        'Funding_Case_Agreement_Forecast.id',
        'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_agreementforecast'
      )
      .innerJoin('Funding_Case_Agreement_Budget_Line_Item', join => join.on(
        budgetLineItemStableId, '=', sql.ref('Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_fundingagreementbudgetlineitem')
      ))
      .innerJoin(
        'Funding_Case_Agreement_Budget_Fiscal_Year',
        'Funding_Case_Agreement_Budget_Fiscal_Year.id',
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear'
      )
      .innerJoin('Funding_Case_Agreement_Budget_Version as Line_Budget_Version', 'Line_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
      .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
      .innerJoin(
        'Transfer_Payment_Stream_Cost_Category_Line_Item',
        'Transfer_Payment_Stream_Cost_Category_Line_Item.id',
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_organizationcostcategory'
      )
      .innerJoin(
        'Agency_Cost_Category_Line_Item',
        'Agency_Cost_Category_Line_Item.id',
        'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_organizationcostcategory'
      )
      .innerJoin(
        'Agency_Cost_Category',
        'Agency_Cost_Category.id',
        'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory'
      )
      .where('Funding_Case_Agreement_Forecast.egcs_fc_fundingagreement', '=', agreementId)
      .$if(Boolean(forecastId), query => query.where('Funding_Case_Agreement_Forecast.id', '=', forecastId!))
      .where('Funding_Case_Agreement_Forecast_Line_Item._deleted', '=', false)
      .where('Funding_Case_Agreement_Forecast._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
      .where('Line_Budget_Version.egcs_fc_iscurrent', '=', true)
      .where('Line_Budget_Version._deleted', '=', false)
      .select([
        'Funding_Case_Agreement_Forecast_Line_Item.id as id',
        'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_agreementforecast as egcs_fc_agreementforecast',
        'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_fundingagreementbudgetlineitem as egcs_fc_fundingagreementbudgetlineitem',
        'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_month as egcs_fc_month',
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_amount')).as('egcs_fc_amount'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_totalamount')).as('egcs_fc_totalamount'),
        'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_currency as egcs_fc_currency',
        'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_version as egcs_fc_version',
        'Funding_Case_Agreement_Forecast.egcs_fc_fiscalyear as forecast_fiscal_year_id',
        budgetFiscalYearStableId.as('budget_fiscal_year_id'),
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as budget_fiscal_year_display',
        'Agency_Cost_Category.egcs_ay_name_en as organization_cost_category_name_en',
        'Agency_Cost_Category.egcs_ay_name_fr as organization_cost_category_name_fr',
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_costsubsection as egcs_fc_costsubsection',
        'Agency_Cost_Category_Line_Item.egcs_ay_name_en as line_item_name_en',
        'Agency_Cost_Category_Line_Item.egcs_ay_name_fr as line_item_name_fr',
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_totalamount')).as('budget_line_total_amount'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_programfunding')).as('budget_line_program_funding')
      ])
      .orderBy('Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_version', 'asc')
      .orderBy('Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_month', 'asc')
      .execute()
  ])

  const budgetFundingSources = budgetFundingSourcesByLine(await loadBudgetFundingSources(db, budgetLineItems.map(line => String(line.budget_row_id))))
  const parsedBudgetLineItems = budgetLineItems.map(lineItem => ({
    ...lineItem,
    egcs_fc_fundingsources: budgetFundingSources.get(String(lineItem.budget_row_id)) ?? [],
    egcs_fc_totalamount: parseDatabaseMoney(lineItem.egcs_fc_totalamount),
    egcs_fc_programfunding: parseDatabaseMoney(lineItem.egcs_fc_programfunding)
  }))
  const sourceRows = lineItems.length === 0
    ? []
    : await db
        .selectFrom('Funding_Case_Agreement_Forecast_Line_Item_Funding')
        .innerJoin('Agency_Funding_Subtype', 'Agency_Funding_Subtype.id', 'Funding_Case_Agreement_Forecast_Line_Item_Funding.egcs_fc_fundingsubtype')
        .innerJoin('Agency_Funding_Type', 'Agency_Funding_Type.id', 'Agency_Funding_Subtype.egcs_ay_fundingtype')
        .select([
          'Funding_Case_Agreement_Forecast_Line_Item_Funding.egcs_fc_forecastlineitem as egcs_fc_forecastlineitem',
          'Funding_Case_Agreement_Forecast_Line_Item_Funding.egcs_fc_fundingsubtype as egcs_fc_fundingsubtype',
          databaseMoneyText(sql.ref('Funding_Case_Agreement_Forecast_Line_Item_Funding.egcs_fc_amount')).as('egcs_fc_amount'),
          'Agency_Funding_Subtype.egcs_ay_name_en as funding_subtype_name_en',
          'Agency_Funding_Subtype.egcs_ay_name_fr as funding_subtype_name_fr',
          'Agency_Funding_Type.egcs_ay_name_en as funding_type_name_en',
          'Agency_Funding_Type.egcs_ay_name_fr as funding_type_name_fr'
        ])
        .where('egcs_fc_forecastlineitem', 'in', lineItems.map(line => String(line.id)))
        .where('Funding_Case_Agreement_Forecast_Line_Item_Funding._deleted', '=', false)
        .execute()
  const sourcesByLine = new Map<string, Array<{
    egcs_fc_fundingsubtype: string
    egcs_fc_amount: ReturnType<typeof parseDatabaseMoney>
    funding_subtype_name_en: string
    funding_subtype_name_fr: string
    funding_type_name_en: string
    funding_type_name_fr: string
  }>>()
  for (const source of sourceRows) {
    const key = String(source.egcs_fc_forecastlineitem)
    const values = sourcesByLine.get(key) ?? []
    values.push({
      egcs_fc_fundingsubtype: String(source.egcs_fc_fundingsubtype),
      egcs_fc_amount: parseDatabaseMoney(source.egcs_fc_amount),
      funding_subtype_name_en: source.funding_subtype_name_en,
      funding_subtype_name_fr: source.funding_subtype_name_fr,
      funding_type_name_en: source.funding_type_name_en,
      funding_type_name_fr: source.funding_type_name_fr
    })
    sourcesByLine.set(key, values)
  }
  const parsedLineItems = lineItems.map(lineItem => ({
    ...lineItem,
    egcs_fc_amount: parseDatabaseMoney(lineItem.egcs_fc_amount),
    egcs_fc_totalamount: parseDatabaseMoney(lineItem.egcs_fc_totalamount),
    egcs_fc_fundingsources: sourcesByLine.get(String(lineItem.id)) ?? [],
    budget_line_total_amount: parseDatabaseMoney(lineItem.budget_line_total_amount),
    budget_line_program_funding: parseDatabaseMoney(lineItem.budget_line_program_funding)
  }))
  const forecastsWithState = await withBusinessRecordState(db, 'fundingcaseforecast', forecasts)
  return {
    forecasts: forecastsWithState,
    budgetLineItems: parsedBudgetLineItems,
    lineItems: parsedLineItems
  }
}

export default defineEventHandler(async event => {
  const { forecastId } = await getValidatedQueryI18n(event, ForecastOverviewQuerySchema)
  return await executeFreshReadSnapshot(event, async () => await readRoute(event, forecastId))
})
