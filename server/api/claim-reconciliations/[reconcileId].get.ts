import { forbidden, notFound } from '~~/server/utils/api-errors'
import {
  canManageEntityAssignments,
  canAccessEntityAssignmentOwner,
  canReadEntityAssignments,
  isEntityAssignmentRosterWorkable,
  resolveEntityAssignmentOwner,
  resolveAssignmentActor
} from '~~/server/utils/entity-assignment'
import { resolveAssignedItemGrant } from '~~/server/utils/rbac'
import { withBusinessRecordState } from '~~/server/utils/business-record-state'
import { isBusinessStatusLineageLocked, resolveBusinessStatusProtection } from '~~/server/utils/business-status-runtime'
import { sql } from 'kysely'
import { budgetLineItemStableId } from '~~/server/utils/agreement-budget-lineage'
import { canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { isDecimalDatabaseId } from '~~/server/utils/database-id'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'

// eslint-disable-next-line local/require-authorize -- owning-entity business read is enforced below
export default defineEventHandler(async event => {
  const reconcileId = getRouterParam(event, 'reconcileId')
  if (!isDecimalDatabaseId(reconcileId)) return await notFound(event, 'CLAIM_RECONCILIATION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const actor = await resolveAssignmentActor(event)
  const owner = await resolveEntityAssignmentOwner(event.context.$db, 'fundingclaimreconcile', reconcileId)
  if (!owner || !await canAccessEntityAssignmentOwner(actor.auth, owner, 'read', event.context.$db)) return await forbidden(event)
  const reconciliation = await event.context.$db.selectFrom('Funding_Case_Agreement_Claim_Reconcile')
    .innerJoin('Funding_Case_Agreement_Claim', 'Funding_Case_Agreement_Claim.id', 'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim')
    .innerJoin('Funding_Case_Agreement_Profile', 'Funding_Case_Agreement_Profile.id', 'Funding_Case_Agreement_Claim.egcs_fc_fundingagreement')
    .selectAll('Funding_Case_Agreement_Claim_Reconcile')
    .select([
      'Funding_Case_Agreement_Claim.egcs_fc_fundingagreement as agreement_id',
      'Funding_Case_Agreement_Claim.egcs_fc_status as claim_status',
      'Funding_Case_Agreement_Profile.egcs_fc_agreementnumber as agreement_number',
      'Funding_Case_Agreement_Profile.egcs_fc_currency as egcs_fc_currency',
      'Funding_Case_Agreement_Profile.egcs_fc_title_en as agreement_title_en',
      'Funding_Case_Agreement_Profile.egcs_fc_title_fr as agreement_title_fr'
    ])
    .where('Funding_Case_Agreement_Claim_Reconcile.id', '=', reconcileId).where('Funding_Case_Agreement_Claim_Reconcile._deleted', '=', false).executeTakeFirst()
  if (!reconciliation) return await notFound(event, 'CLAIM_RECONCILIATION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const [reconciliationWithState] = await withBusinessRecordState(
    event.context.$db,
    'fundingclaimreconcile',
    [reconciliation]
  )
  const lines = await event.context.$db.selectFrom('Funding_Case_Agreement_Claim_Line_Item')
    .leftJoin('Funding_Case_Agreement_Claim_Reconcile_Line_Item as Reconcile_Line', join => join
      .onRef('Reconcile_Line.egcs_fc_lineitem', '=', 'Funding_Case_Agreement_Claim_Line_Item.id')
      .on('Reconcile_Line.egcs_fc_fundingagreementclaimreconcile', '=', reconcileId)
      .on('Reconcile_Line._deleted', '=', false))
    .leftJoin(eb => eb.selectFrom('Funding_Case_Agreement_Budget_Line_Item')
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year', 'Funding_Case_Agreement_Budget_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear')
      .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
      .select([
        budgetLineItemStableId.as('stable_id'),
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_organizationcostcategory',
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_costsubsection'
      ])
      .where('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreement', '=', String(reconciliation.agreement_id))
      .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
      .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
      .as('Current_Budget_Line'), join => join
      .onRef('Current_Budget_Line.stable_id', '=', 'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementbudgetlineitem'))
    .leftJoin('Transfer_Payment_Stream_Cost_Category_Line_Item', 'Transfer_Payment_Stream_Cost_Category_Line_Item.id', 'Current_Budget_Line.egcs_fc_organizationcostcategory')
    .leftJoin('Agency_Cost_Category_Line_Item', 'Agency_Cost_Category_Line_Item.id', 'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_organizationcostcategory')
    .leftJoin('Agency_Cost_Category', 'Agency_Cost_Category.id', 'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory')
    .select([
      'Funding_Case_Agreement_Claim_Line_Item.id as claim_line_id',
      'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_description as description',
      'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_submittedlineitem as submitted_line_item',
      'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_submittedcostcategory as submitted_cost_category',
      'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_submittedcostsubsection as submitted_cost_subsection',
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Claim_Line_Item.egcs_fc_amount')).as('submitted_amount'),
      'Agency_Cost_Category.egcs_ay_name_en as organization_cost_category_name_en',
      'Agency_Cost_Category.egcs_ay_name_fr as organization_cost_category_name_fr',
      'Current_Budget_Line.egcs_fc_costsubsection as egcs_fc_costsubsection',
      'Reconcile_Line.id as reconcile_line_id',
      databaseMoneyText(sql.ref('Reconcile_Line.egcs_fc_reconciled')).as('egcs_fc_reconciled'),
      databaseMoneyText(sql.ref('Reconcile_Line.egcs_fc_sampled')).as('egcs_fc_sampled'),
      'Reconcile_Line.egcs_fc_rationale as egcs_fc_rationale'
    ])
    .where('Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementclaim', '=', String(reconciliation.egcs_fc_fundingagreementclaim))
    .where('Funding_Case_Agreement_Claim_Line_Item._deleted', '=', false)
    .orderBy('Funding_Case_Agreement_Claim_Line_Item.id')
    .execute()
  const grant = await resolveAssignedItemGrant(actor.auth.userId, 'fundingclaimreconcile', reconcileId, event.context.$db)
  const hasUpdateRole = owner
    ? await canAccessEntityAssignmentOwner(actor.auth, owner, 'update', event.context.$db)
    : false
  const [lineageLocked, agreementProtection] = await Promise.all([
    isBusinessStatusLineageLocked(event.context.$db, 'fundingclaimreconcile', reconcileId),
    resolveBusinessStatusProtection(event.context.$db, 'fundingcaseagreement', String(reconciliation.agreement_id))
  ])
  const canWork = grant?.actions.has('update') === true && hasUpdateRole && !lineageLocked
  const canUpdate = canWork
    && agreementProtection?.locked === false
    && await isEntityAssignmentRosterWorkable(event.context.$db, 'fundingclaimreconcile', reconcileId)
  const agreementScope = await resolveAgreementScopeContext(String(reconciliation.agreement_id), event.context.$db)
  const canReadAgreement = agreementScope
    ? await canAccessAgreement(actor.auth, 'read', agreementScope.scope, event.context.$db)
    : false
  const canReadClaim = await canReadEntityAssignments(
    event,
    'fundingcaseagreementclaim',
    String(reconciliation.egcs_fc_fundingagreementclaim)
  )
  return {
    reconciliation: reconciliationWithState,
    lines: lines.map(line => ({
      ...line,
      submitted_amount: parseDatabaseMoney(line.submitted_amount),
      egcs_fc_reconciled: line.egcs_fc_reconciled == null ? line.egcs_fc_reconciled : parseDatabaseMoney(line.egcs_fc_reconciled),
      egcs_fc_sampled: line.egcs_fc_sampled == null ? line.egcs_fc_sampled : parseDatabaseMoney(line.egcs_fc_sampled)
    })),
    can_read: true,
    can_update_role: hasUpdateRole,
    can_update: canUpdate,
    can_cancel: canWork && reconciliation.egcs_fc_isopen,
    can_read_agreement: canReadAgreement,
    can_read_claim: canReadClaim,
    can_manage_assignments: await canManageEntityAssignments(event, 'fundingclaimreconcile', reconcileId),
    is_assigned: grant?.actions.has('update') === true && hasUpdateRole,
    is_primary: grant?.isPrimary === true
  }
})
