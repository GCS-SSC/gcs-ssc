import {
  assertAgreementClaimReconcileEditable,
  executeAgreementClaimMutation,
  prepareAgreementClaimRoute,
  syncAgreementClaimReconcileEditingStatus
} from '~~/server/utils/agreement-claim'
import { badRequest } from '~~/server/utils/api-errors'
import { resolveClaimReconcileLineAssignmentTarget } from '~~/server/utils/agreement-assignment-target'

export default defineEventHandler(async event => {
  const lineId = getRouterParam(event, 'lineId')
  if (!lineId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const assignmentTarget = await resolveClaimReconcileLineAssignmentTarget(event.context.$db, lineId)
  if (!assignmentTarget) return await badRequest(event, 'AGREEMENT_CLAIM_RECONCILE_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.claim_reconcile_line_item_not_found')
  const prepared = await prepareAgreementClaimRoute(event, 'delete', assignmentTarget)
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  await executeAgreementClaimMutation(event, db, agreementId, agreementContext, async trx => {
    const child = await trx.selectFrom('Funding_Case_Agreement_Claim_Reconcile_Line_Item').select('egcs_fc_fundingagreementclaimreconcile').where('id', '=', lineId).where('_deleted', '=', false).executeTakeFirst()
    if (!child) return []
    const reconcileId = String(child.egcs_fc_fundingagreementclaimreconcile)
    const reconcile = await trx.selectFrom('Funding_Case_Agreement_Claim_Reconcile').select('egcs_fc_fundingagreementclaim').where('id', '=', reconcileId).executeTakeFirst()
    return reconcile ? [{ type: 'claim', id: String(reconcile.egcs_fc_fundingagreementclaim) }, { type: 'claimReconcile', id: reconcileId }] : []
  }, async trx => {
    const existing = await trx
      .selectFrom('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
      .innerJoin('Funding_Case_Agreement_Claim_Reconcile', 'Funding_Case_Agreement_Claim_Reconcile.id', 'Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_fundingagreementclaimreconcile')
      .innerJoin('Funding_Case_Agreement_Claim', 'Funding_Case_Agreement_Claim.id', 'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim')
      .where('Funding_Case_Agreement_Claim_Reconcile_Line_Item.id', '=', lineId)
      .where('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Claim_Reconcile_Line_Item._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim_Reconcile._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim._deleted', '=', false)
      .select('Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_fundingagreementclaimreconcile as egcs_fc_fundingagreementclaimreconcile')
      .executeTakeFirst()

    if (!existing) {
      return await badRequest(event, 'AGREEMENT_CLAIM_RECONCILE_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.claim_reconcile_line_item_not_found')
    }

    const reconcile = await assertAgreementClaimReconcileEditable(event, trx, agreementId, String(existing.egcs_fc_fundingagreementclaimreconcile))
    if (!reconcile || typeof reconcile !== 'object' || !('id' in reconcile)) return reconcile
    await trx.updateTable('Funding_Case_Agreement_Claim_Reconcile_Line_Item').set({ _deleted: true }).where('id', '=', lineId).where('egcs_fc_fundingagreementclaimreconcile', '=', existing.egcs_fc_fundingagreementclaimreconcile).where('_deleted', '=', false).execute()
    await syncAgreementClaimReconcileEditingStatus(trx, String(existing.egcs_fc_fundingagreementclaimreconcile))
  }, { action: 'delete' })

  return { success: true }
})
