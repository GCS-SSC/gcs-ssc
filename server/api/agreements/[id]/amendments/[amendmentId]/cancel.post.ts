import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import {
  assertEditableAgreementAmendment,
  resolveAgreementAmendmentRuntimeContext
} from '~~/server/utils/agreement-amendment'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { cancelWorkflowRun, resolveActiveWorkflowSetup } from '~~/server/utils/workflow-runtime'
import { transitionBusinessStatus } from '~~/server/utils/business-status-runtime'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const amendmentId = getRouterParam(event, 'amendmentId')
  if (!agreementId || !amendmentId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(agreementId) || !isPositivePostgresBigintText(amendmentId)) {
    return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid')
  }
  const context = await authorizeAgreementResource(event, 'update', agreementId, db)
  if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async trx => {
    const amendment = await assertEditableAgreementAmendment(event, trx, agreementId, amendmentId)
    if (!('id' in amendment)) return amendment
    const currentUser = await resolveCurrentCommonUser(event, trx)
    if (!currentUser) return await badRequest(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const activeWorkflow = await trx.selectFrom('Common_Runtime')
      .innerJoin('Common_Workflow_Run', 'Common_Workflow_Run.id', 'Common_Runtime.id')
      .selectAll('Common_Runtime')
      .select('Common_Workflow_Run.egcs_cn_completion')
      .where('Common_Runtime.egcs_cn_kind', '=', 'workflow')
      .where('Common_Runtime.egcs_cn_entitytype', '=', 'fundingcaseamendment')
      .where('Common_Runtime.egcs_cn_entityid', '=', amendmentId)
      .where('Common_Runtime.egcs_cn_purpose', '=', 'approval_submission')
      .where('Common_Runtime.egcs_cn_state', 'in', ['pending', 'active', 'awaiting_action', 'paused'])
      .where('Common_Runtime._deleted', '=', false)
      .forUpdate(['Common_Runtime', 'Common_Workflow_Run']).executeTakeFirst()
    if (!activeWorkflow) {
      const runtimeContext = await resolveAgreementAmendmentRuntimeContext(trx, amendmentId)
      if (runtimeContext) {
        const setup = await resolveActiveWorkflowSetup(trx, {
          entityType: 'fundingcaseamendment',
          entityId: amendmentId,
          agreementId: runtimeContext.agreementId,
          applicantRecipientLeadAgencyId: null,
          schemaAgencyId: runtimeContext.agencyId,
          reviewSetId: null
        }, 'approval_submission', true)
        if (setup) {
          await transitionBusinessStatus(
            trx,
            'fundingcaseamendment',
            amendmentId,
            setup.publicationDefinition.cancellationStatus
          )
        }
      }
    }
    if (!activeWorkflow) {
      const refreshed = await resolveAgreementAmendmentRuntimeContext(trx, amendmentId)
      if (!refreshed || refreshed.amendmentStatus === amendment.egcs_fc_status) {
        return await badRequest(event, 'AGREEMENT_AMENDMENT_WORKFLOW_REQUIRED', 'apiErrors.request.invalid_status')
      }
    } else {
      await cancelWorkflowRun(trx, activeWorkflow, currentUser.id)
    }
    return await trx.updateTable('Funding_Case_Agreement_Amendment').set({ egcs_fc_isopen: false })
      .where('id', '=', amendmentId).where('_deleted', '=', false).returningAll().executeTakeFirstOrThrow()
  }, {
    action: 'update',
    assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId },
    businessStatusTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId },
    businessStatusMode: 'workflow'
  })
})
