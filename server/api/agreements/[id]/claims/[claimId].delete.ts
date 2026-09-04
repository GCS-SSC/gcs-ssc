import { badRequest } from '~~/server/utils/api-errors'
import {
  assertAgreementClaimEditable,
  executeAgreementClaimMutation,
  prepareAgreementClaimRoute
} from '~~/server/utils/agreement-claim'

export default defineEventHandler(async event => {
  const claimId = getRouterParam(event, 'claimId')
  if (!claimId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const prepared = await prepareAgreementClaimRoute(event, 'delete', {
    entityType: 'fundingcaseagreementclaim',
    entityId: claimId
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared

  await executeAgreementClaimMutation(event, db, agreementId, agreementContext, [{ type: 'claim', id: claimId }], async trx => {
    const claim = await assertAgreementClaimEditable(event, trx, agreementId, claimId)
    if (!claim || typeof claim !== 'object' || !('id' in claim)) return claim

    const deleted = await trx
      .updateTable('Funding_Case_Agreement_Claim')
      .set({ _deleted: true })
      .where('id', '=', claimId)
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .returning('id')
      .executeTakeFirst()
    if (!deleted) {
      return await badRequest(event, 'AGREEMENT_CLAIM_NOT_FOUND', 'apiErrors.agreement.claim_not_found')
    }

    const reconcileIds = await trx
      .selectFrom('Funding_Case_Agreement_Claim_Reconcile')
      .select('id')
      .where('egcs_fc_fundingagreementclaim', '=', claimId)
      .where('_deleted', '=', false)
      .execute()

    if (reconcileIds.length > 0) {
      await trx
        .updateTable('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
        .set({ _deleted: true })
        .where('egcs_fc_fundingagreementclaimreconcile', 'in', reconcileIds.map(reconcile => String(reconcile.id)))
        .where('_deleted', '=', false)
        .execute()
    }

    await trx
      .updateTable('Funding_Case_Agreement_Claim_Reconcile')
      .set({ _deleted: true })
      .where('egcs_fc_fundingagreementclaim', '=', claimId)
      .where('_deleted', '=', false)
      .execute()

    await trx
      .updateTable('Funding_Case_Agreement_Claim_Line_Item')
      .set({ _deleted: true })
      .where('egcs_fc_fundingagreementclaim', '=', claimId)
      .where('_deleted', '=', false)
      .execute()
  }, { action: 'delete' })

  return { success: true }
})
