import {
  assertAgreementClaimReconcileEditable,
  executeAgreementClaimMutation,
  prepareAgreementClaimRoute
} from '~~/server/utils/agreement-claim'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { isDecimalDatabaseId } from '~~/server/utils/database-id'

export default defineEventHandler(async event => {
  const reconcileId = getRouterParam(event, 'reconcileId')
  if (!reconcileId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isDecimalDatabaseId(reconcileId)) {
    return await notFound(event, 'CLAIM_RECONCILIATION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  const prepared = await prepareAgreementClaimRoute(event, 'delete', {
    entityType: 'fundingclaimreconcile',
    entityId: reconcileId
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared

  await executeAgreementClaimMutation(event, db, agreementId, agreementContext, async trx => {
    const reconcile = await trx.selectFrom('Funding_Case_Agreement_Claim_Reconcile').select('egcs_fc_fundingagreementclaim').where('id', '=', reconcileId).where('_deleted', '=', false).executeTakeFirst()
    return reconcile
      ? [{ type: 'claim', id: String(reconcile.egcs_fc_fundingagreementclaim) }, { type: 'claimReconcile', id: reconcileId }]
      : []
  }, async trx => {
    const reconcile = await assertAgreementClaimReconcileEditable(event, trx, agreementId, reconcileId)
    if (!reconcile || typeof reconcile !== 'object' || !('id' in reconcile)) return reconcile

    const deleted = await trx
      .updateTable('Funding_Case_Agreement_Claim_Reconcile')
      .set({ _deleted: true })
      .where('id', '=', reconcileId)
      .where('_deleted', '=', false)
      .returning('id')
      .executeTakeFirst()
    if (!deleted) {
      return await badRequest(event, 'AGREEMENT_CLAIM_RECONCILE_NOT_FOUND', 'apiErrors.agreement.claim_reconcile_not_found')
    }

    await trx
      .updateTable('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
      .set({ _deleted: true })
      .where('egcs_fc_fundingagreementclaimreconcile', '=', reconcileId)
      .where('_deleted', '=', false)
      .execute()
  }, { action: 'delete' })

  return { success: true }
})
