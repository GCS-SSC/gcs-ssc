import { badRequest } from '~~/server/utils/api-errors'
import { resolveClaimLineAssignmentTarget } from '~~/server/utils/agreement-assignment-target'
import {
  assertAgreementClaimEditable,
  executeAgreementClaimMutation,
  prepareAgreementClaimRoute,
  syncAgreementClaimEditingStatus
} from '~~/server/utils/agreement-claim'

export default defineEventHandler(async event => {
  const lineId = getRouterParam(event, 'lineId')
  if (!lineId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const assignmentTarget = await resolveClaimLineAssignmentTarget(event.context.$db, lineId)
  if (!assignmentTarget) return await badRequest(event, 'AGREEMENT_CLAIM_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.claim_line_item_not_found')
  const prepared = await prepareAgreementClaimRoute(event, 'delete', assignmentTarget)
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  await executeAgreementClaimMutation(event, db, agreementId, agreementContext, async trx => {
    const child = await trx.selectFrom('Funding_Case_Agreement_Claim_Line_Item').select('egcs_fc_fundingagreementclaim').where('id', '=', lineId).where('_deleted', '=', false).executeTakeFirst()
    return child ? [{ type: 'claim', id: String(child.egcs_fc_fundingagreementclaim) }] : []
  }, async trx => {
    const existing = await trx
      .selectFrom('Funding_Case_Agreement_Claim_Line_Item')
      .innerJoin('Funding_Case_Agreement_Claim', 'Funding_Case_Agreement_Claim.id', 'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementclaim')
      .where('Funding_Case_Agreement_Claim_Line_Item.id', '=', lineId)
      .where('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Claim_Line_Item._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim._deleted', '=', false)
      .select('Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementclaim as egcs_fc_fundingagreementclaim')
      .executeTakeFirst()

    if (!existing) {
      return await badRequest(event, 'AGREEMENT_CLAIM_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.claim_line_item_not_found')
    }

    const claim = await assertAgreementClaimEditable(event, trx, agreementId, String(existing.egcs_fc_fundingagreementclaim))
    if (!claim || typeof claim !== 'object' || !('id' in claim)) return claim
    await trx.updateTable('Funding_Case_Agreement_Claim_Reconcile_Line_Item').set({ _deleted: true }).where('egcs_fc_lineitem', '=', lineId).where('_deleted', '=', false).execute()
    await trx.updateTable('Funding_Case_Agreement_Claim_Line_Item').set({ _deleted: true }).where('id', '=', lineId).where('egcs_fc_fundingagreementclaim', '=', existing.egcs_fc_fundingagreementclaim).where('_deleted', '=', false).execute()
    await syncAgreementClaimEditingStatus(trx, String(existing.egcs_fc_fundingagreementclaim))
  }, { action: 'delete' })

  return { success: true }
})
