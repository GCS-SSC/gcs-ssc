/* eslint-disable jsdoc/require-jsdoc */
import { sql, type Kysely, type Selectable, type Transaction } from 'kysely'
import type { H3Event } from 'h3'
import type { Database } from '~~/shared/types/database'
import { calculateBudgetPercentages } from '~~/shared/utils/budget-percentage'
import { addMoney, compareMoney, isPersistableMoney, zeroMoney, type Money } from '~~/shared/utils/money'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { badRequest, throwApiError } from './api-errors'
import { assertAgreementBudgetProgramFundingCapacity } from './agreement-budget'
import { AgreementBudgetFinancialLimitError, assertAgreementBudgetFinancialLimits } from './agreement-budget-financial-limits'
import { assertAgreementCurrentBudgetUsage } from './agreement-financial-budget-controls'
import { assertAgreementFundingModeInput } from './agreement-funding-breakdown'
import { parseI18n } from './api-validate'
import { FundingCaseAgreementBudgetLineDescriptionSchema, FundingCaseAgreementBudgetLineItemFundingTotalsSchema, FundingCaseAgreementBudgetLineTextSchema, type FundingCaseAgreementBudgetLineItem, type FundingCaseAgreementBudgetLineItemPatch } from '~~/shared/types/schemas'
import { validateMergedBudgetLineItemFundingPatch, validateMergedBudgetLineTextPatch } from './agreement-financial-patch-validation'

type Db = Kysely<Database> | Transaction<Database>
type Input = { egcs_fc_organizationcostcategory?: string, egcs_fc_percentage?: number | null, egcs_fc_programfunding?: Money, egcs_fc_fundingagreementbudgetfiscalyear?: string, egcs_fc_currency?: string }
type BudgetSettings = Pick<Selectable<Database['Transfer_Payment_Stream']>, 'egcs_tp_budgetfundingmode' | 'egcs_tp_hidecostsubsection'>
type BudgetLineState = Parameters<typeof validateMergedBudgetLineItemFundingPatch>[1] & Parameters<typeof validateMergedBudgetLineTextPatch>[1]

export const prepareNewBudgetLine = async (event: H3Event, settings: BudgetSettings, body: FundingCaseAgreementBudgetLineItem, programFunding: Money) => {
  const mode = settings.egcs_tp_budgetfundingmode
  await assertAgreementFundingModeInput(event, mode, { total: body.egcs_fc_totalamount })
  if (settings.egcs_tp_hidecostsubsection) {
    body.egcs_fc_costsubsection = ''
    body.egcs_fc_costsubsection_fr = ''
  } else {
    await parseI18n(event, FundingCaseAgreementBudgetLineTextSchema, body)
  }
  const total = mode === 'manual' ? body.egcs_fc_totalamount : programFunding
  if (!total) return await badRequest(event, 'AGREEMENT_TOTAL_COST_REQUIRED', 'apiErrors.agreement.total_cost_required')
  await parseI18n(event, FundingCaseAgreementBudgetLineItemFundingTotalsSchema, { egcs_fc_totalamount: total, egcs_fc_programfunding: programFunding })
  const { egcs_fc_fundingsources: _sources, ...line } = body
  return { ...line, egcs_fc_totalamount: total, egcs_fc_programfunding: programFunding }
}

export const validateBudgetLinePatch = async (event: H3Event, settings: BudgetSettings, existing: BudgetLineState, patch: FundingCaseAgreementBudgetLineItemPatch) => {
  const mode = settings.egcs_tp_budgetfundingmode
  await assertAgreementFundingModeInput(event, mode, { total: patch.egcs_fc_totalamount, sources: patch.egcs_fc_fundingsources })
  if (mode === 'program_only' && patch.egcs_fc_fundingsources !== undefined) {
    await badRequest(event, 'AGREEMENT_OTHER_FUNDING_DISABLED', 'apiErrors.agreement.other_funding_disabled')
  }
  if (settings.egcs_tp_hidecostsubsection) {
    delete patch.egcs_fc_costsubsection
    delete patch.egcs_fc_costsubsection_fr
  }
  const retainsBlankSubsection = !existing.egcs_fc_costsubsection && !existing.egcs_fc_costsubsection_fr
    && !patch.egcs_fc_costsubsection && !patch.egcs_fc_costsubsection_fr
  if (settings.egcs_tp_hidecostsubsection || retainsBlankSubsection) {
    if (Object.hasOwn(patch, 'egcs_fc_description') || Object.hasOwn(patch, 'egcs_fc_description_fr')) {
      await parseI18n(event, FundingCaseAgreementBudgetLineDescriptionSchema, { ...existing, ...patch })
    }
  } else {
    await validateMergedBudgetLineTextPatch(event, existing, patch)
  }
  if (mode === 'manual') await validateMergedBudgetLineItemFundingPatch(event, existing, patch)
}

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
    const rows = await loadCalculationRows(db, year.egcs_fc_budgetversion, { includeOtherFunding: false })
    const draftId = rowId ?? '__new__'
    try {
      const amounts = calculateBudgetPercentages([
        ...rows.filter(row => row.id !== draftId).map(row => ({ ...row, programFunding: parseDatabaseMoney(row.programFunding, row.currency) })),
        { id: draftId, versionId: year.egcs_fc_budgetversion, fiscalYearId: year.egcs_fc_fiscalyear,
          currency: input.egcs_fc_currency ?? existing!.egcs_fc_currency, categoryId: definition.categoryId,
          mode: config.mode, sourceCategoryId: config.source, percentage: input.egcs_fc_percentage ?? config.percentage,
          programFunding: zeroMoney(input.egcs_fc_currency ?? existing!.egcs_fc_currency) }
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

const loadCalculationRows = async (
  db: Db,
  versionId: string,
  { includeOtherFunding, pendingLineId }: { includeOtherFunding: boolean, pendingLineId?: string }
) => await db.selectFrom('Funding_Case_Agreement_Budget_Line_Item as line')
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
    databaseMoneyText(includeOtherFunding
      ? sql`COALESCE((SELECT SUM(funding.egcs_fc_amount)
          FROM "Funding_Case_Agreement_Budget_Line_Item_Funding" funding
          WHERE funding.egcs_fc_budgetlineitem = line.id AND NOT funding._deleted), 0)`
      : sql`0`).as('otherFunding')])
  .where('line.egcs_fc_budgetversion', '=', versionId)
  .where(eb => eb.or([
    eb('line.egcs_fc_pendingfunding', '=', false),
    ...(pendingLineId !== undefined ? [eb('line.id', '=', pendingLineId)] : [])
  ]))
  .where('line._deleted', '=', false).where('year._deleted', '=', false)
  .orderBy('line.id').forUpdate('line').execute()

type BudgetLineFundingState = 'pending' | 'active'

export const recalculateAgreementBudget = async (
  event: H3Event,
  db: Db,
  rowId: string,
  streamId: string,
  state: BudgetLineFundingState = 'active'
) => {
  const anchor = await db.selectFrom('Funding_Case_Agreement_Budget_Line_Item').select('egcs_fc_budgetversion').where('id', '=', rowId).executeTakeFirstOrThrow()
  const { egcs_tp_budgetfundingmode: fundingMode } = await db.selectFrom('Transfer_Payment_Stream')
    .select('egcs_tp_budgetfundingmode').where('id', '=', streamId).executeTakeFirstOrThrow()
  const pendingLineId = state === 'pending' ? rowId : undefined
  const rows = await loadCalculationRows(db, anchor.egcs_fc_budgetversion, {
    includeOtherFunding: fundingMode !== 'program_only',
    pendingLineId
  })
  let amounts: Map<string, Money>
  try {
    amounts = calculateBudgetPercentages(rows.map(row => ({ ...row, programFunding: parseDatabaseMoney(row.programFunding, row.currency) })))
  } catch {
    return await badRequest(event, 'INVALID_BUDGET_CALCULATION', 'apiErrors.agreement.invalid_budget_calculation')
  }
  const totals = new Map<string, Money>()
  for (const row of rows) {
    const programFunding = amounts.get(row.id)!
    const savedTotal = parseDatabaseMoney(row.totalAmount, row.currency)
    const funding = fundingMode === 'program_only'
      ? programFunding
      : addMoney(programFunding, parseDatabaseMoney(row.otherFunding, row.currency))
    const exceedsSavedTotal = compareMoney(funding, savedTotal) > 0
    if (!isPersistableMoney(programFunding) || !isPersistableMoney(funding) || (fundingMode === 'manual' && exceedsSavedTotal)) {
      await throwApiError(event, { statusCode: 400, code: 'VALIDATION_FAILED', key: 'apiErrors.agreement.calculated_funding_exceeds_total', params: { row: row.description }, details: [{ path: `lineItems.${row.id}.egcs_fc_totalamount`, message: row.description }] })
    }
    totals.set(row.id, fundingMode === 'automatic' || (fundingMode === 'program_only' && exceedsSavedTotal) ? funding : savedTotal)
  }
  const version = await db.selectFrom('Funding_Case_Agreement_Budget_Version').select(['egcs_fc_iscurrent', 'egcs_fc_fundingagreement']).where('id', '=', anchor.egcs_fc_budgetversion).executeTakeFirstOrThrow()

  try {
    await assertAgreementBudgetFinancialLimits(db, { agreementId: String(version.egcs_fc_fundingagreement), versionId: anchor.egcs_fc_budgetversion, streamId }, {
      amounts, totals, pendingLineId
    })
  } catch (error: unknown) {
    const fundingLimitPreventsActivation = error instanceof AgreementBudgetFinancialLimitError
      && (error.violation.kind === 'stacking' || (error.violation.kind === 'support' && error.violation.lineId === rowId))
    if (state === 'active' || !fundingLimitPreventsActivation) throw error

    // Keep the candidate and saved sources available without affecting the active budget.
    const total = totals.get(rowId)!
    const program = amounts.get(rowId)!
    await db.updateTable('Funding_Case_Agreement_Budget_Line_Item')
      .set({
        egcs_fc_pendingfunding: true,
        egcs_fc_programfunding: databaseMoneyValue(program),
        egcs_fc_totalamount: databaseMoneyValue(total)
      }).where('id', '=', rowId).execute()
    return { amounts: new Map([[rowId, program]]), totals: new Map([[rowId, total]]), pendingFunding: true }
  }

  for (const row of rows) {
    const total = totals.get(row.id)!
    const program = amounts.get(row.id)!
    const activate = row.id === pendingLineId
    if (!activate && total.amount === row.totalAmount && program.amount === row.programFunding) continue
    await db.updateTable('Funding_Case_Agreement_Budget_Line_Item')
      .set({
        egcs_fc_totalamount: databaseMoneyValue(total),
        egcs_fc_programfunding: databaseMoneyValue(program),
        ...(activate ? { egcs_fc_pendingfunding: false } : {})
      }).where('id', '=', row.id).execute()
  }
  if (version.egcs_fc_iscurrent) {
    const years = new Map(rows.map(row => [`${row.yearRowId}:${row.currency}`, { identity: row.yearIdentity ?? row.yearRowId, currency: row.currency }]))
    for (const { identity, currency } of years.values()) await assertAgreementBudgetProgramFundingCapacity(event, db, streamId, identity, zeroMoney(currency), { lockStreamBudget: true, currency })
    await assertAgreementCurrentBudgetUsage(db, String(version.egcs_fc_fundingagreement))
  }
  return { amounts, totals, pendingFunding: false }
}

export const recalculateBudgetAfterLineWrite = async (
  event: H3Event,
  db: Transaction<Database>,
  { lineId, streamId, state }: { lineId: string, streamId: string, state: BudgetLineFundingState }
) => await recalculateAgreementBudget(event, db, lineId, streamId, state)
