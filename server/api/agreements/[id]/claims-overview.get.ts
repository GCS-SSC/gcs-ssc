import { sql } from 'kysely'
import { defineEventHandler, type H3Event } from 'h3'
import { budgetFiscalYearStableId, budgetLineItemStableId } from '~~/server/utils/agreement-budget-lineage'
import { prepareAgreementClaimRoute } from '~~/server/utils/agreement-claim'
import { canReadEntityAssignments } from '~~/server/utils/entity-assignment'
import { withBusinessRecordState } from '~~/server/utils/business-record-state'
import { hasPositiveCompletionTerminus } from '~~/server/utils/completion-terminus'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { notFound } from '~~/server/utils/api-errors'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { z } from 'zod'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'
import { budgetFundingSourcesByLine, loadBudgetFundingSources } from '~~/server/utils/agreement-budget-funding'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

export const ClaimOverviewQuerySchema = z.object({
  claimId: PositivePostgresBigintIdSchema.optional()
}).strict()

/**
 * Reads the authorized Claim overview within one established snapshot.
 * @param event - Current request event.
 * @param claimId - Optional Claim selection.
 * @returns The complete overview projection or route error.
 */
const readRoute = async (event: H3Event, claimId?: string) => {
  let assignmentTarget
  if (claimId) {
    assignmentTarget = { entityType: 'fundingcaseagreementclaim' as const, entityId: claimId }
  }
  const prepared = await prepareAgreementClaimRoute(event, 'read', assignmentTarget)
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, db } = prepared

  // Saved references may identify a retained physical copy. Normalize only the
  // read identity; keep persisted foreign keys unchanged for subsequent writes.
  const claimFiscalYearId = sql<string>`COALESCE(
    ${sql.ref('Claim_Source_Year.egcs_fc_originalbudgetfiscalyear')}, ${sql.ref('Claim_Source_Year.id')}
  )`
  const claimContextFiscalYearId = sql<string>`COALESCE(
    ${sql.ref('Claim_Context_Year.egcs_fc_originalbudgetfiscalyear')}, ${sql.ref('Claim_Context_Year.id')}
  )`
  const claimBudgetLineId = sql<string>`COALESCE(
    ${sql.ref('Claim_Source_Line.egcs_fc_originalbudgetlineitem')}, ${sql.ref('Claim_Source_Line.id')}
  )`
  const sourceLineFiscalYearId = sql<string>`COALESCE(
    ${sql.ref('Claim_Line_Source_Year.egcs_fc_originalbudgetfiscalyear')}, ${sql.ref('Claim_Line_Source_Year.id')}
  )`

  const budgetLineQuery = db
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
    .$if(Boolean(claimId), query => query
      .innerJoin('Funding_Case_Agreement_Claim as Claim_Context', join => join
        .on('Claim_Context.id', '=', claimId!)
        .on('Claim_Context.egcs_fc_fundingagreement', '=', agreementId)
        .on('Claim_Context._deleted', '=', false))
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as Claim_Context_Year', join => join
        .onRef('Claim_Context_Year.id', '=', 'Claim_Context.egcs_fc_fiscalyear')
        .on('Claim_Context_Year.egcs_fc_fundingagreement', '=', agreementId))
      .where(budgetFiscalYearStableId, '=', claimContextFiscalYearId))
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
    .where('Agency_Fiscal_Year._deleted', '=', false)
    .where('Transfer_Payment_Stream_Cost_Category_Line_Item._deleted', '=', false)
    .where('Agency_Cost_Category_Line_Item._deleted', '=', false)
    .where('Agency_Cost_Category._deleted', '=', false)

  const [claims, budgetLineItems, lineItems, unfilteredReconciles, unfilteredReconcileLineItems, currentFiscalYears] = await Promise.all([
    db
      .selectFrom('Funding_Case_Agreement_Claim')
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as Claim_Source_Year', join => join
        .onRef('Claim_Source_Year.id', '=', 'Funding_Case_Agreement_Claim.egcs_fc_fiscalyear')
        .on('Claim_Source_Year.egcs_fc_fundingagreement', '=', agreementId))
      .leftJoin('Applicant_Recipient_Profile as submitting_proponent', 'submitting_proponent.id', 'Funding_Case_Agreement_Claim.egcs_fc_applicantrecipient')
      .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Claim_Source_Year.egcs_fc_fiscalyear')
      .where('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement', '=', agreementId)
      .$if(Boolean(claimId), query => query.where('Funding_Case_Agreement_Claim.id', '=', claimId!))
      .where('Funding_Case_Agreement_Claim._deleted', '=', false)

      .select([
        'Funding_Case_Agreement_Claim.id as id',
        'Funding_Case_Agreement_Claim.egcs_fc_fundingagreement as egcs_fc_fundingagreement',
        'Funding_Case_Agreement_Claim.egcs_fc_fiscalyear as egcs_fc_fiscalyear',
        claimFiscalYearId.as('fiscal_year_id'),
        'Funding_Case_Agreement_Claim.egcs_fc_applicantrecipient as egcs_fc_applicantrecipient',
        sql<string>`COALESCE(${sql.ref('submitting_proponent.egcs_ar_operatingname_en')},${sql.ref('submitting_proponent.egcs_ar_legalname_en')},${''})`.as('submitting_proponent_name_en'),
        sql<string>`COALESCE(${sql.ref('submitting_proponent.egcs_ar_operatingname_fr')},${sql.ref('submitting_proponent.egcs_ar_legalname_fr')},${''})`.as('submitting_proponent_name_fr'),
        'Funding_Case_Agreement_Claim.egcs_fc_isfinalforyear as egcs_fc_isfinalforyear',
        'Funding_Case_Agreement_Claim.egcs_fc_periodend as egcs_fc_periodend',
        'Funding_Case_Agreement_Claim.egcs_fc_periodstart as egcs_fc_periodstart',
        'Funding_Case_Agreement_Claim.egcs_fc_receiveddate as egcs_fc_receiveddate',
        'Funding_Case_Agreement_Claim.egcs_fc_status as egcs_fc_status',
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display'
      ])
      .orderBy('Agency_Fiscal_Year.egcs_ay_fiscalyear', 'asc')
      .orderBy('Funding_Case_Agreement_Claim.egcs_fc_receiveddate', 'asc')
      .execute(),
    budgetLineQuery
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
      .orderBy(sql`LOWER(${sql.ref('Agency_Cost_Category.egcs_ay_name_en')})`, 'asc')
      .orderBy(sql`LOWER(${sql.ref('Agency_Cost_Category_Line_Item.egcs_ay_name_en')})`, 'asc')
      .execute(),
    db
      .selectFrom('Funding_Case_Agreement_Claim_Line_Item')
      .innerJoin('Funding_Case_Agreement_Claim', 'Funding_Case_Agreement_Claim.id', 'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementclaim')
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as Claim_Source_Year', join => join
        .onRef('Claim_Source_Year.id', '=', 'Funding_Case_Agreement_Claim.egcs_fc_fiscalyear')
        .on('Claim_Source_Year.egcs_fc_fundingagreement', '=', agreementId))
      .leftJoin('Funding_Case_Agreement_Budget_Line_Item as Claim_Source_Line', join => join
        .onRef('Claim_Source_Line.id', '=', 'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementbudgetlineitem')
        .on('Claim_Source_Line.egcs_fc_fundingagreement', '=', agreementId))
      .leftJoin('Funding_Case_Agreement_Budget_Fiscal_Year as Claim_Line_Source_Year', join => join
        .onRef('Claim_Line_Source_Year.id', '=', 'Claim_Source_Line.egcs_fc_fundingagreementbudgetfiscalyear')
        .on('Claim_Line_Source_Year.egcs_fc_fundingagreement', '=', agreementId))
      .leftJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Claim_Line_Source_Year.egcs_fc_fiscalyear')
      .leftJoin('Transfer_Payment_Stream_Cost_Category_Line_Item', 'Transfer_Payment_Stream_Cost_Category_Line_Item.id', 'Claim_Source_Line.egcs_fc_organizationcostcategory')
      .leftJoin('Agency_Cost_Category_Line_Item', 'Agency_Cost_Category_Line_Item.id', 'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_organizationcostcategory')
      .leftJoin('Agency_Cost_Category', 'Agency_Cost_Category.id', 'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory')
      .where('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement', '=', agreementId)
      .$if(Boolean(claimId), query => query.where('Funding_Case_Agreement_Claim.id', '=', claimId!))
      .where('Funding_Case_Agreement_Claim_Line_Item._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim._deleted', '=', false)
      .select([
        'Funding_Case_Agreement_Claim_Line_Item.id as id',
        'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementclaim as egcs_fc_fundingagreementclaim',
        'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementbudgetlineitem as egcs_fc_fundingagreementbudgetlineitem',
        claimBudgetLineId.as('budget_line_item_id'),
        'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_submittedcostcategory as egcs_fc_submittedcostcategory',
        'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_submittedcostsubsection as egcs_fc_submittedcostsubsection',
        'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_submittedlineitem as egcs_fc_submittedlineitem',
        'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_description as egcs_fc_description',
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Claim_Line_Item.egcs_fc_amount')).as('egcs_fc_amount'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Claim_Line_Item.egcs_fc_totalamount')).as('egcs_fc_totalamount'),
        'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_currency as egcs_fc_currency',
        claimFiscalYearId.as('claim_fiscal_year_id'),
        sourceLineFiscalYearId.as('budget_fiscal_year_id'),
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as budget_fiscal_year_display',
        'Agency_Cost_Category.egcs_ay_name_en as organization_cost_category_name_en',
        'Agency_Cost_Category.egcs_ay_name_fr as organization_cost_category_name_fr',
        'Claim_Source_Line.egcs_fc_costsubsection as egcs_fc_costsubsection',
        'Agency_Cost_Category_Line_Item.egcs_ay_name_en as line_item_name_en',
        'Agency_Cost_Category_Line_Item.egcs_ay_name_fr as line_item_name_fr',
        databaseMoneyText(sql.ref('Claim_Source_Line.egcs_fc_totalamount')).as('budget_line_total_amount'),
        databaseMoneyText(sql.ref('Claim_Source_Line.egcs_fc_programfunding')).as('budget_line_program_funding')
      ])
      .execute(),
    db
      .selectFrom('Funding_Case_Agreement_Claim_Reconcile')
      .innerJoin('Funding_Case_Agreement_Claim', 'Funding_Case_Agreement_Claim.id', 'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim')
      .innerJoin('Common_User', 'Common_User.id', 'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_user')
      .where('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement', '=', agreementId)
      .$if(Boolean(claimId), query => query.where('Funding_Case_Agreement_Claim.id', '=', claimId!))
      .where('Funding_Case_Agreement_Claim_Reconcile._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim._deleted', '=', false)
      .select([
        'Funding_Case_Agreement_Claim_Reconcile.id as id',
        'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim as egcs_fc_fundingagreementclaim',
        'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_user as egcs_fc_user',
        'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_status as egcs_fc_status',
        'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_isfinal as egcs_fc_isfinal',
        'Common_User.egcs_cn_name as user_name',
        'Common_User.egcs_cn_positiontitle as user_position_title'
      ])
      .execute(),
    db
      .selectFrom('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
      .innerJoin('Funding_Case_Agreement_Claim_Reconcile', 'Funding_Case_Agreement_Claim_Reconcile.id', 'Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_fundingagreementclaimreconcile')
      .innerJoin('Funding_Case_Agreement_Claim_Line_Item', 'Funding_Case_Agreement_Claim_Line_Item.id', 'Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_lineitem')
      .innerJoin('Funding_Case_Agreement_Claim', 'Funding_Case_Agreement_Claim.id', 'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementclaim')
      .where('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement', '=', agreementId)
      .$if(Boolean(claimId), query => query.where('Funding_Case_Agreement_Claim.id', '=', claimId!))
      .where('Funding_Case_Agreement_Claim_Reconcile_Line_Item._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim_Reconcile._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim_Line_Item._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim._deleted', '=', false)
      .select([
        'Funding_Case_Agreement_Claim_Reconcile_Line_Item.id as id',
        'Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_fundingagreementclaimreconcile as egcs_fc_fundingagreementclaimreconcile',
        'Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_lineitem as egcs_fc_lineitem',
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_reconciled')).as('egcs_fc_reconciled'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_sampled')).as('egcs_fc_sampled'),
        'Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_rationale as egcs_fc_rationale',
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Claim_Line_Item.egcs_fc_amount')).as('claim_line_item_amount'),
        'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_description as claim_line_item_description'
      ])
      .execute(),
    db.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
      .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
      .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
      .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
      .select(budgetFiscalYearStableId.as('id'))
      .execute()
  ])

  if (claimId && claims.length === 0) {
    return await notFound(event, 'AGREEMENT_CLAIM_NOT_FOUND', 'apiErrors.agreement.claim_not_found')
  }

  let reconciles = unfilteredReconciles
  let reconcileLineItems = unfilteredReconcileLineItems
  if (claimId) {
    const readableReconcileIds = new Set<string>()
    await Promise.all(unfilteredReconciles.map(async reconcile => {
      const reconcileId = String(reconcile.id)
      if (await canReadEntityAssignments(event, 'fundingclaimreconcile', reconcileId)) {
        readableReconcileIds.add(reconcileId)
      }
    }))
    reconciles = unfilteredReconciles.filter(reconcile => readableReconcileIds.has(String(reconcile.id)))
    reconcileLineItems = unfilteredReconcileLineItems.filter(line =>
      readableReconcileIds.has(String(line.egcs_fc_fundingagreementclaimreconcile))
    )
  }

  const currentBudgetById = new Map(budgetLineItems.map(line => [String(line.id), line]))
  const projectedLines = lineItems.map(line => {
    const current = currentBudgetById.get(String(line.budget_line_item_id))
    if (!current || String(line.budget_fiscal_year_id) !== String(line.claim_fiscal_year_id)) return line
    return {
      ...line,
      budget_fiscal_year_id: current.fiscal_year_id,
      budget_fiscal_year_display: current.fiscal_year_display,
      organization_cost_category_name_en: current.organization_cost_category_name_en,
      organization_cost_category_name_fr: current.organization_cost_category_name_fr,
      egcs_fc_costsubsection: current.egcs_fc_costsubsection,
      line_item_name_en: current.line_item_name_en,
      line_item_name_fr: current.line_item_name_fr,
      budget_line_total_amount: current.egcs_fc_totalamount,
      budget_line_program_funding: current.egcs_fc_programfunding
    }
  })
  const projectedLineById = new Map(projectedLines.map(line => [String(line.id), line]))

  const [claimsWithRecordState, reconcilesWithState] = await Promise.all([
    withBusinessRecordState(db, 'fundingcaseagreementclaim', claims),
    withBusinessRecordState(db, 'fundingclaimreconcile', reconciles)
  ])
  const currentFiscalYearIds = new Set(currentFiscalYears.map(year => String(year.id)))
  const claimsWithState = await Promise.all(claimsWithRecordState.map(async claim => ({
    ...claim,
    fiscal_year_available: currentFiscalYearIds.has(String(claim.fiscal_year_id)),
    hasPositiveCompletionTerminus: await hasPositiveCompletionTerminus(
      db,
      'fundingcaseagreementclaim',
      String(claim.id)
    )
  })))

  const sourceRows = lineItems.length === 0
    ? []
    : await db
        .selectFrom('Funding_Case_Agreement_Claim_Line_Item_Funding')
        .innerJoin('Agency_Funding_Subtype', 'Agency_Funding_Subtype.id', 'Funding_Case_Agreement_Claim_Line_Item_Funding.egcs_fc_fundingsubtype')
        .innerJoin('Agency_Funding_Type', 'Agency_Funding_Type.id', 'Agency_Funding_Subtype.egcs_ay_fundingtype')
        .select([
          'Funding_Case_Agreement_Claim_Line_Item_Funding.egcs_fc_claimlineitem as egcs_fc_claimlineitem',
          'Funding_Case_Agreement_Claim_Line_Item_Funding.egcs_fc_fundingsubtype as egcs_fc_fundingsubtype',
          databaseMoneyText(sql.ref('Funding_Case_Agreement_Claim_Line_Item_Funding.egcs_fc_amount')).as('egcs_fc_amount'),
          'Agency_Funding_Subtype.egcs_ay_name_en as funding_subtype_name_en',
          'Agency_Funding_Subtype.egcs_ay_name_fr as funding_subtype_name_fr',
          'Agency_Funding_Type.egcs_ay_name_en as funding_type_name_en',
          'Agency_Funding_Type.egcs_ay_name_fr as funding_type_name_fr'
        ])
        .where('egcs_fc_claimlineitem', 'in', lineItems.map(line => String(line.id)))
        .where('Funding_Case_Agreement_Claim_Line_Item_Funding._deleted', '=', false)
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
    const key = String(source.egcs_fc_claimlineitem)
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
  const budgetFundingSources = budgetFundingSourcesByLine(await loadBudgetFundingSources(db, budgetLineItems.map(line => String(line.budget_row_id))))

  return {
    claims: claimsWithState,
    budgetLineItems: budgetLineItems.map(line => ({
      ...line,
      egcs_fc_fundingsources: budgetFundingSources.get(String(line.budget_row_id)) ?? [],
      egcs_fc_totalamount: parseDatabaseMoney(line.egcs_fc_totalamount),
      egcs_fc_programfunding: parseDatabaseMoney(line.egcs_fc_programfunding)
    })),
    lineItems: projectedLines.map(line => ({
      ...line,
      egcs_fc_amount: parseDatabaseMoney(line.egcs_fc_amount),
      egcs_fc_totalamount: parseDatabaseMoney(line.egcs_fc_totalamount),
      egcs_fc_fundingsources: sourcesByLine.get(String(line.id)) ?? [],
      budget_line_total_amount: line.budget_line_total_amount == null ? line.budget_line_total_amount : parseDatabaseMoney(line.budget_line_total_amount),
      budget_line_program_funding: line.budget_line_program_funding == null ? line.budget_line_program_funding : parseDatabaseMoney(line.budget_line_program_funding)
    })),
    reconciles: reconcilesWithState,
    reconcileLineItems: reconcileLineItems.map(line => ({
      ...(() => {
        const source = projectedLineById.get(String(line.egcs_fc_lineitem))
        return {
          organization_cost_category_name_en: source?.organization_cost_category_name_en ?? null,
          organization_cost_category_name_fr: source?.organization_cost_category_name_fr ?? null,
          egcs_fc_costsubsection: source?.egcs_fc_costsubsection ?? null,
          line_item_name_en: source?.line_item_name_en ?? null,
          line_item_name_fr: source?.line_item_name_fr ?? null
        }
      })(),
      ...line,
      egcs_fc_reconciled: parseDatabaseMoney(line.egcs_fc_reconciled),
      egcs_fc_sampled: line.egcs_fc_sampled == null ? line.egcs_fc_sampled : parseDatabaseMoney(line.egcs_fc_sampled),
      claim_line_item_amount: parseDatabaseMoney(line.claim_line_item_amount)
    }))
  }
}

export default defineEventHandler(async event => {
  const { claimId } = await getValidatedQueryI18n(event, ClaimOverviewQuerySchema)
  return await executeFreshReadSnapshot(event, () => readRoute(event, claimId), { authorization: 'snapshot' })
})
