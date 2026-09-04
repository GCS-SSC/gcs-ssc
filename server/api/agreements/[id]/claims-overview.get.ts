import { sql } from 'kysely'
import { budgetFiscalYearStableId, budgetLineItemStableId } from '~~/server/utils/agreement-budget-lineage'
import { prepareAgreementClaimRoute } from '~~/server/utils/agreement-claim'
import { canReadEntityAssignments } from '~~/server/utils/entity-assignment'
import { withBusinessRecordState } from '~~/server/utils/business-record-state'
import { hasPositiveCompletionTerminus } from '~~/server/utils/completion-terminus'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { z } from 'zod'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'

export const ClaimOverviewQuerySchema = z.object({
  claimId: PositivePostgresBigintIdSchema.optional()
}).strict()

export default defineEventHandler(async event => {
  const { claimId } = await getValidatedQueryI18n(event, ClaimOverviewQuerySchema)
  let assignmentTarget
  if (claimId) {
    assignmentTarget = { entityType: 'fundingcaseagreementclaim' as const, entityId: claimId }
  }
  const prepared = await prepareAgreementClaimRoute(event, 'read', assignmentTarget)
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, db } = prepared

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
    .$if(Boolean(claimId), query => query.innerJoin('Funding_Case_Agreement_Claim as Claim_Context', join => join
      .on(budgetFiscalYearStableId, '=', sql.ref('Claim_Context.egcs_fc_fiscalyear'))
      .on('Claim_Context.id', '=', claimId!)
      .on('Claim_Context._deleted', '=', false)))
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

  const [claims, budgetLineItems, lineItems, unfilteredReconciles, unfilteredReconcileLineItems] = await Promise.all([
    db
      .selectFrom('Funding_Case_Agreement_Claim')
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year', join => join.on(
        budgetFiscalYearStableId, '=', sql.ref('Funding_Case_Agreement_Claim.egcs_fc_fiscalyear')
      ))
      .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
      .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
      .where('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement', '=', agreementId)
      .$if(Boolean(claimId), query => query.where('Funding_Case_Agreement_Claim.id', '=', claimId!))
      .where('Funding_Case_Agreement_Claim._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
      .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
      .where('Agency_Fiscal_Year._deleted', '=', false)
      .select([
        'Funding_Case_Agreement_Claim.id as id',
        'Funding_Case_Agreement_Claim.egcs_fc_fundingagreement as egcs_fc_fundingagreement',
        'Funding_Case_Agreement_Claim.egcs_fc_fiscalyear as egcs_fc_fiscalyear',
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
        budgetFiscalYearStableId.as('egcs_fc_fundingagreementbudgetfiscalyear'),
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_organizationcostcategory as egcs_fc_organizationcostcategory',
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_costsubsection as egcs_fc_costsubsection',
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_description as egcs_fc_description',
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_totalamount')).as('egcs_fc_totalamount'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_programfunding')).as('egcs_fc_programfunding'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_otherfederalfunding')).as('egcs_fc_otherfederalfunding'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_othergovfunding')).as('egcs_fc_othergovfunding'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_otherfunding')).as('egcs_fc_otherfunding'),
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
      .orderBy(sql`LOWER("Agency_Cost_Category_Line_Item"."egcs_ay_name_en")`, 'asc')
      .execute(),
    db
      .selectFrom('Funding_Case_Agreement_Claim_Line_Item')
      .innerJoin('Funding_Case_Agreement_Claim', 'Funding_Case_Agreement_Claim.id', 'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementclaim')
      .leftJoin('Funding_Case_Agreement_Budget_Line_Item', join => join.on(budgetLineItemStableId, '=', sql.ref('Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementbudgetlineitem')))
      .leftJoin('Funding_Case_Agreement_Budget_Fiscal_Year', 'Funding_Case_Agreement_Budget_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear')
      .leftJoin('Funding_Case_Agreement_Budget_Version as Claim_Line_Budget_Version', 'Claim_Line_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
      .leftJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
      .leftJoin('Transfer_Payment_Stream_Cost_Category_Line_Item', 'Transfer_Payment_Stream_Cost_Category_Line_Item.id', 'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_organizationcostcategory')
      .leftJoin('Agency_Cost_Category_Line_Item', 'Agency_Cost_Category_Line_Item.id', 'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_organizationcostcategory')
      .leftJoin('Agency_Cost_Category', 'Agency_Cost_Category.id', 'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory')
      .where('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement', '=', agreementId)
      .$if(Boolean(claimId), query => query.where('Funding_Case_Agreement_Claim.id', '=', claimId!))
      .where('Funding_Case_Agreement_Claim_Line_Item._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim._deleted', '=', false)
      .where(eb => eb.or([
        eb('Funding_Case_Agreement_Budget_Line_Item.id', 'is', null),
        eb('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
      ]))
      .where(eb => eb.or([
        eb('Funding_Case_Agreement_Budget_Fiscal_Year.id', 'is', null),
        eb('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
      ]))
      .where(eb => eb.or([
        eb('Claim_Line_Budget_Version.id', 'is', null),
        eb.and([
          eb('Claim_Line_Budget_Version.egcs_fc_iscurrent', '=', true),
          eb('Claim_Line_Budget_Version._deleted', '=', false)
        ])
      ]))
      .select([
        'Funding_Case_Agreement_Claim_Line_Item.id as id',
        'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementclaim as egcs_fc_fundingagreementclaim',
        'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementbudgetlineitem as egcs_fc_fundingagreementbudgetlineitem',
        'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_submittedcostcategory as egcs_fc_submittedcostcategory',
        'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_submittedcostsubsection as egcs_fc_submittedcostsubsection',
        'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_submittedlineitem as egcs_fc_submittedlineitem',
        'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_description as egcs_fc_description',
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Claim_Line_Item.egcs_fc_amount')).as('egcs_fc_amount'),
        'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_currency as egcs_fc_currency',
        'Funding_Case_Agreement_Claim.egcs_fc_fiscalyear as claim_fiscal_year_id',
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
        'Common_User.egcs_cn_position_title as user_position_title'
      ])
      .execute(),
    db
      .selectFrom('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
      .innerJoin('Funding_Case_Agreement_Claim_Reconcile', 'Funding_Case_Agreement_Claim_Reconcile.id', 'Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_fundingagreementclaimreconcile')
      .innerJoin('Funding_Case_Agreement_Claim_Line_Item', 'Funding_Case_Agreement_Claim_Line_Item.id', 'Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_lineitem')
      .innerJoin('Funding_Case_Agreement_Claim', 'Funding_Case_Agreement_Claim.id', 'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementclaim')
      .leftJoin('Funding_Case_Agreement_Budget_Line_Item', join => join.on(budgetLineItemStableId, '=', sql.ref('Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementbudgetlineitem')))
      .leftJoin('Funding_Case_Agreement_Budget_Fiscal_Year', 'Funding_Case_Agreement_Budget_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear')
      .leftJoin('Funding_Case_Agreement_Budget_Version as Reconcile_Line_Budget_Version', 'Reconcile_Line_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
      .leftJoin('Transfer_Payment_Stream_Cost_Category_Line_Item', 'Transfer_Payment_Stream_Cost_Category_Line_Item.id', 'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_organizationcostcategory')
      .leftJoin('Agency_Cost_Category_Line_Item', 'Agency_Cost_Category_Line_Item.id', 'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_organizationcostcategory')
      .leftJoin('Agency_Cost_Category', 'Agency_Cost_Category.id', 'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory')
      .where('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement', '=', agreementId)
      .$if(Boolean(claimId), query => query.where('Funding_Case_Agreement_Claim.id', '=', claimId!))
      .where('Funding_Case_Agreement_Claim_Reconcile_Line_Item._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim_Reconcile._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim_Line_Item._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim._deleted', '=', false)
      .where(eb => eb.or([
        eb('Funding_Case_Agreement_Budget_Line_Item.id', 'is', null),
        eb('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
      ]))
      .where(eb => eb.or([
        eb('Funding_Case_Agreement_Budget_Fiscal_Year.id', 'is', null),
        eb('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
      ]))
      .where(eb => eb.or([
        eb('Reconcile_Line_Budget_Version.id', 'is', null),
        eb.and([
          eb('Reconcile_Line_Budget_Version.egcs_fc_iscurrent', '=', true),
          eb('Reconcile_Line_Budget_Version._deleted', '=', false)
        ])
      ]))
      .select([
        'Funding_Case_Agreement_Claim_Reconcile_Line_Item.id as id',
        'Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_fundingagreementclaimreconcile as egcs_fc_fundingagreementclaimreconcile',
        'Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_lineitem as egcs_fc_lineitem',
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_reconciled')).as('egcs_fc_reconciled'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_sampled')).as('egcs_fc_sampled'),
        'Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_rationale as egcs_fc_rationale',
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Claim_Line_Item.egcs_fc_amount')).as('claim_line_item_amount'),
        'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_description as claim_line_item_description',
        'Agency_Cost_Category.egcs_ay_name_en as organization_cost_category_name_en',
        'Agency_Cost_Category.egcs_ay_name_fr as organization_cost_category_name_fr',
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_costsubsection as egcs_fc_costsubsection',
        'Agency_Cost_Category_Line_Item.egcs_ay_name_en as line_item_name_en',
        'Agency_Cost_Category_Line_Item.egcs_ay_name_fr as line_item_name_fr'
      ])
      .execute()
  ])

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

  const [claimsWithRecordState, reconcilesWithState] = await Promise.all([
    withBusinessRecordState(db, 'fundingcaseagreementclaim', claims),
    withBusinessRecordState(db, 'fundingclaimreconcile', reconciles)
  ])
  const claimsWithState = await Promise.all(claimsWithRecordState.map(async claim => ({
    ...claim,
    hasPositiveCompletionTerminus: await hasPositiveCompletionTerminus(
      db,
      'fundingcaseagreementclaim',
      String(claim.id)
    )
  })))

  return {
    claims: claimsWithState,
    budgetLineItems: budgetLineItems.map(line => ({
      ...line,
      egcs_fc_totalamount: parseDatabaseMoney(line.egcs_fc_totalamount),
      egcs_fc_programfunding: parseDatabaseMoney(line.egcs_fc_programfunding),
      egcs_fc_otherfederalfunding: line.egcs_fc_otherfederalfunding == null ? line.egcs_fc_otherfederalfunding : parseDatabaseMoney(line.egcs_fc_otherfederalfunding),
      egcs_fc_othergovfunding: line.egcs_fc_othergovfunding == null ? line.egcs_fc_othergovfunding : parseDatabaseMoney(line.egcs_fc_othergovfunding),
      egcs_fc_otherfunding: line.egcs_fc_otherfunding == null ? line.egcs_fc_otherfunding : parseDatabaseMoney(line.egcs_fc_otherfunding)
    })),
    lineItems: lineItems.map(line => ({
      ...line,
      egcs_fc_amount: parseDatabaseMoney(line.egcs_fc_amount),
      budget_line_total_amount: line.budget_line_total_amount == null ? line.budget_line_total_amount : parseDatabaseMoney(line.budget_line_total_amount),
      budget_line_program_funding: line.budget_line_program_funding == null ? line.budget_line_program_funding : parseDatabaseMoney(line.budget_line_program_funding)
    })),
    reconciles: reconcilesWithState,
    reconcileLineItems: reconcileLineItems.map(line => ({
      ...line,
      egcs_fc_reconciled: parseDatabaseMoney(line.egcs_fc_reconciled),
      egcs_fc_sampled: line.egcs_fc_sampled == null ? line.egcs_fc_sampled : parseDatabaseMoney(line.egcs_fc_sampled),
      claim_line_item_amount: parseDatabaseMoney(line.claim_line_item_amount)
    }))
  }
})
