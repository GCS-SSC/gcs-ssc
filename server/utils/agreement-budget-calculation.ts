/* eslint-disable jsdoc/require-jsdoc */
import { sql, type Kysely, type Transaction } from 'kysely'
import type { H3Event } from 'h3'
import type { Database } from '~~/shared/types/database'
import { calculateBudgetPercentages } from '~~/shared/utils/budget-percentage'
import { isNumeric19Money, moneyToCents, parseMoney, type Money } from '~~/shared/utils/money'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { badRequest, throwApiError } from './api-errors'
import { assertAgreementBudgetProgramFundingCapacity } from './agreement-budget'

type Db = Kysely<Database> | Transaction<Database>
type Input = { egcs_fc_organizationcostcategory?: string, egcs_fc_percentage?: number | null, egcs_fc_programfunding?: Money, egcs_fc_fundingagreementbudgetfiscalyear?: string, egcs_fc_currency?: string }

export const prepareBudgetCalculation = async (event: H3Event, db: Db, input: Input, rowId?: string, createYearRowId?: string) => {
  const config = rowId
    ? await db.selectFrom('Funding_Case_Agreement_Budget_Line_Item').select([
        'egcs_fc_calculationmode as mode', 'egcs_fc_percentage as percentage',
        'egcs_fc_sourcecategory as source', 'egcs_fc_allowpercentageoverride as override'
      ]).where('id', '=', rowId).executeTakeFirstOrThrow()
    : await db.selectFrom('Transfer_Payment_Stream_Cost_Category_Line_Item')
        .innerJoin('Agency_Cost_Category_Line_Item', 'Agency_Cost_Category_Line_Item.id', 'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_organizationcostcategory')
        .select(['egcs_ay_calculationmode as mode', 'egcs_ay_percentage as percentage', 'egcs_ay_sourcecategory as source', 'egcs_ay_allowpercentageoverride as override'])
        .where('Transfer_Payment_Stream_Cost_Category_Line_Item.id', '=', input.egcs_fc_organizationcostcategory!)
        .executeTakeFirstOrThrow()
  if ((config.mode !== 'manual' && input.egcs_fc_programfunding !== undefined)
    || (input.egcs_fc_percentage != null && (config.mode === 'manual' || !config.override))) {
    await badRequest(event, 'BUDGET_CALCULATION_READ_ONLY', 'apiErrors.agreement.budget_calculation_read_only')
  }
  if (config.mode === 'manual' && !rowId && input.egcs_fc_programfunding === undefined) {
    await badRequest(event, 'PROGRAM_FUNDING_REQUIRED', 'apiErrors.agreement.program_funding_required')
  }
  let programFunding: Money | undefined
  if (config.mode !== 'manual') {
    const existing = rowId ? await db.selectFrom('Funding_Case_Agreement_Budget_Line_Item').select(['egcs_fc_budgetversion', 'egcs_fc_fundingagreementbudgetfiscalyear', 'egcs_fc_organizationcostcategory', 'egcs_fc_currency']).where('id', '=', rowId).executeTakeFirstOrThrow() : undefined
    const year = await db.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year').selectAll()
      .$if(Boolean(existing), query => query.where('egcs_fc_budgetversion', '=', existing!.egcs_fc_budgetversion))
      .$if(Boolean(createYearRowId), query => query.where('id', '=', createYearRowId!))
      .$if(!createYearRowId, query => input.egcs_fc_fundingagreementbudgetfiscalyear
        ? query.where(sql<string>`COALESCE(egcs_fc_originalbudgetfiscalyear, id)::text`, '=', input.egcs_fc_fundingagreementbudgetfiscalyear)
        : query.where('id', '=', existing!.egcs_fc_fundingagreementbudgetfiscalyear))
      .where('_deleted', '=', false).executeTakeFirstOrThrow()
    const definition = await db.selectFrom('Transfer_Payment_Stream_Cost_Category_Line_Item as stream')
      .innerJoin('Agency_Cost_Category_Line_Item as definition', 'definition.id', 'stream.egcs_tp_organizationcostcategory')
      .select('definition.egcs_ay_organizationcostcategory as categoryId')
      .where('stream.id', '=', input.egcs_fc_organizationcostcategory ?? existing!.egcs_fc_organizationcostcategory).executeTakeFirstOrThrow()
    const rows = await loadCalculationRows(db, year.egcs_fc_budgetversion)
    const draftId = rowId ?? '__new__'
    try {
      const amounts = calculateBudgetPercentages([
        ...rows.filter(row => row.id !== draftId).map(row => ({ ...row, programFunding: parseDatabaseMoney(row.programFunding) })),
        { id: draftId, versionId: year.egcs_fc_budgetversion, fiscalYearId: year.egcs_fc_fiscalyear,
          currency: input.egcs_fc_currency ?? existing!.egcs_fc_currency, categoryId: definition.categoryId,
          mode: config.mode, sourceCategoryId: config.source, percentage: input.egcs_fc_percentage ?? config.percentage,
          programFunding: parseMoney('0') }
      ])
      programFunding = amounts.get(draftId)!
    } catch { await badRequest(event, 'INVALID_BUDGET_CALCULATION', 'apiErrors.agreement.invalid_budget_calculation') }
  }
  return {
    egcs_fc_calculationmode: config.mode,
    egcs_fc_sourcecategory: config.source,
    egcs_fc_percentage: input.egcs_fc_percentage ?? config.percentage,
    egcs_fc_allowpercentageoverride: config.override,
    ...(programFunding === undefined ? {} : { egcs_fc_programfunding: programFunding })
  }
}

const loadCalculationRows = async (db: Db, versionId: string) => await db.selectFrom('Funding_Case_Agreement_Budget_Line_Item as line')
  .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as year', 'year.id', 'line.egcs_fc_fundingagreementbudgetfiscalyear')
  .innerJoin('Transfer_Payment_Stream_Cost_Category_Line_Item as stream', 'stream.id', 'line.egcs_fc_organizationcostcategory')
  .innerJoin('Agency_Cost_Category_Line_Item as definition', 'definition.id', 'stream.egcs_tp_organizationcostcategory')
  .select(['line.id', 'line.egcs_fc_budgetversion as versionId', 'year.egcs_fc_fiscalyear as fiscalYearId',
    'year.id as yearRowId', 'year.egcs_fc_originalbudgetfiscalyear as yearIdentity',
    'line.egcs_fc_currency as currency', 'definition.egcs_ay_organizationcostcategory as categoryId',
    'line.egcs_fc_calculationmode as mode', 'line.egcs_fc_sourcecategory as sourceCategoryId',
    'line.egcs_fc_percentage as percentage', 'line.egcs_fc_description as description',
    databaseMoneyText(sql.ref('line.egcs_fc_programfunding')).as('programFunding'),
    databaseMoneyText(sql.ref('line.egcs_fc_totalamount')).as('totalAmount'),
    databaseMoneyText(sql`COALESCE(line.egcs_fc_otherfederalfunding, 0) + COALESCE(line.egcs_fc_othergovfunding, 0) + COALESCE(line.egcs_fc_otherfunding, 0)`).as('otherFunding')])
  .where('line.egcs_fc_budgetversion', '=', versionId)
  .where('line._deleted', '=', false).where('year._deleted', '=', false)
  .orderBy('line.id').forUpdate('line').execute()

export const recalculateAgreementBudget = async (event: H3Event, db: Db, rowId: string, streamId: string) => {
  const anchor = await db.selectFrom('Funding_Case_Agreement_Budget_Line_Item').select('egcs_fc_budgetversion').where('id', '=', rowId).executeTakeFirstOrThrow()
  const rows = await loadCalculationRows(db, anchor.egcs_fc_budgetversion)
  let amounts: Map<string, Money>
  try {
    amounts = calculateBudgetPercentages(rows.map(row => ({ ...row, programFunding: parseDatabaseMoney(row.programFunding) })))
  } catch {
    return await badRequest(event, 'INVALID_BUDGET_CALCULATION', 'apiErrors.agreement.invalid_budget_calculation')
  }
  for (const row of rows) {
    const amount = amounts.get(row.id)!
    if (!isNumeric19Money(amount) || moneyToCents(amount) + moneyToCents(parseDatabaseMoney(row.otherFunding)) > moneyToCents(parseDatabaseMoney(row.totalAmount))) {
      await throwApiError(event, { statusCode: 400, code: 'VALIDATION_FAILED', key: 'apiErrors.agreement.calculated_funding_exceeds_total', params: { row: row.description }, details: [{ path: `lineItems.${row.id}.egcs_fc_totalamount`, message: row.description }] })
    }
  }
  for (const row of rows) {
    if (row.mode !== 'manual') await db.updateTable('Funding_Case_Agreement_Budget_Line_Item')
      .set({ egcs_fc_programfunding: databaseMoneyValue(amounts.get(row.id)!) }).where('id', '=', row.id).execute()
  }
  const version = await db.selectFrom('Funding_Case_Agreement_Budget_Version').select('egcs_fc_iscurrent').where('id', '=', anchor.egcs_fc_budgetversion).executeTakeFirstOrThrow()
  if (version.egcs_fc_iscurrent) {
    const years = new Map(rows.map(row => [row.yearRowId, row.yearIdentity ?? row.yearRowId]))
    for (const identity of years.values()) await assertAgreementBudgetProgramFundingCapacity(event, db, streamId, identity, parseMoney('0'), { lockStreamBudget: true })
  }
  return amounts
}
