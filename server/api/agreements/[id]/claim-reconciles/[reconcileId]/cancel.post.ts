import { badRequest, notFound, unauthorized } from '~~/server/utils/api-errors'
import {
  assertAgreementClaimReconcileExists,
  assertNoCompletedFinalAgreementClaimReconcile,
  executeAgreementClaimMutation,
  prepareAgreementClaimRoute,
  resolveAgreementClaimReconcileRuntimeContext
} from '~~/server/utils/agreement-claim'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { cancelWorkflowRun, resolveActiveWorkflowSetup } from '~~/server/utils/workflow-runtime'
import { transitionBusinessStatus } from '~~/server/utils/business-status-runtime'
import { isDecimalDatabaseId } from '~~/server/utils/database-id'

export default defineEventHandler(async event => {
  const reconcileId = getRouterParam(event, 'reconcileId')
  if (!reconcileId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isDecimalDatabaseId(reconcileId)) return await notFound(event, 'CLAIM_RECONCILIATION_NOT_FOUND', 'apiErrors.admin_common.not_found')

  const prepared = await prepareAgreementClaimRoute(event, 'update', {
    entityType: 'fundingclaimreconcile',
    entityId: reconcileId
  })
  if (!prepared || !('agreementId' in prepared)) return prepared
  const { agreementId, agreementContext, db } = prepared

  return await executeAgreementClaimMutation(event, db, agreementId, agreementContext, async trx => {
    const reconcile = await trx.selectFrom('Funding_Case_Agreement_Claim_Reconcile')
      .select('egcs_fc_fundingagreementclaim')
      .where('id', '=', reconcileId).where('_deleted', '=', false).executeTakeFirst()
    return reconcile
      ? [{ type: 'claim', id: String(reconcile.egcs_fc_fundingagreementclaim) }, { type: 'claimReconcile', id: reconcileId }]
      : []
  }, async trx => {
    const reconcile = await assertAgreementClaimReconcileExists(event, trx, agreementId, reconcileId)
    if (!reconcile || !('id' in reconcile)) return reconcile
    if (!reconcile.egcs_fc_isopen) {
      return await badRequest(event, 'AGREEMENT_CLAIM_RECONCILE_CLOSED', 'apiErrors.request.invalid_status')
    }
    const finalLock = await assertNoCompletedFinalAgreementClaimReconcile(
      event,
      trx,
      String(reconcile.egcs_fc_fundingagreementclaim)
    )
    if (finalLock) return finalLock

    const actor = await resolveCurrentCommonUser(event, trx)
    if (!actor) return await unauthorized(event)
    const activeWorkflow = await trx.selectFrom('Common_Runtime')
      .innerJoin('Common_Workflow_Run', 'Common_Workflow_Run.id', 'Common_Runtime.id')
      .selectAll('Common_Runtime')
      .select('Common_Workflow_Run.egcs_cn_completion')
      .where('Common_Runtime.egcs_cn_kind', '=', 'workflow')
      .where('Common_Runtime.egcs_cn_entitytype', '=', 'fundingclaimreconcile')
      .where('Common_Runtime.egcs_cn_entityid', '=', reconcileId)
      .where('Common_Runtime.egcs_cn_state', 'in', ['pending', 'active', 'awaiting_action', 'paused'])
      .where('Common_Runtime._deleted', '=', false)
      .forUpdate(['Common_Runtime', 'Common_Workflow_Run'])
      .executeTakeFirst()

    if (activeWorkflow) {
      await cancelWorkflowRun(trx, activeWorkflow, actor.id)
    } else {
      const runtimeContext = await resolveAgreementClaimReconcileRuntimeContext(trx, reconcileId)
      const setup = runtimeContext
        ? await resolveActiveWorkflowSetup(trx, {
            entityType: 'fundingclaimreconcile', entityId: reconcileId,
            agreementId: runtimeContext.agreementId,
            applicantRecipientLeadAgencyId: null, schemaAgencyId: runtimeContext.agencyId,
            reviewSetId: null, isOpen: runtimeContext.isOpen
          }, 'approval_submission', true)
        : null
      // Approval submission is optional for reconciliation completion. When no
      // workflow is configured there is no cancellation status to apply, but
      // the assigned contributor must still be able to close the draft and
      // release the single-open-final slot.
      if (setup) {
        await transitionBusinessStatus(
          trx,
          'fundingclaimreconcile',
          reconcileId,
          setup.publicationDefinition.cancellationStatus
        )
      }
    }

    return await trx.updateTable('Funding_Case_Agreement_Claim_Reconcile')
      .set({ egcs_fc_isopen: false, egcs_fc_isfinal: false })
      .where('id', '=', reconcileId)
      .where('egcs_fc_isopen', '=', true)
      .where('_deleted', '=', false)
      .returningAll()
      .executeTakeFirstOrThrow()
  }, { action: 'update', businessStatusMode: 'workflow' })
})
