import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { badRequest, notFound, throwApiError } from '~~/server/utils/api-errors'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { cancelWorkflowRun } from '~~/server/utils/workflow-runtime'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  const closeoutId = getRouterParam(event, 'closeoutId')
  if (!agreementId || !closeoutId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const db = event.context.$db
  const assignmentTarget = { entityType: 'fundingcaseagreementcloseout' as const, entityId: closeoutId }
  const context = await authorizeAgreementResource(event, 'update', agreementId, db, { assignmentTarget })
  if (!context) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async trx => {
    const closeout = await trx.selectFrom('Funding_Case_Agreement_Closeout').selectAll()
      .where('id', '=', closeoutId).where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!closeout) return await notFound(event, 'AGREEMENT_CLOSEOUT_NOT_FOUND', 'apiErrors.agreement.closeout_not_found')
    const actor = await resolveCurrentCommonUser(event, trx)
    if (!actor) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const activeRun = await trx.selectFrom('Common_Runtime')
      .innerJoin('Common_Workflow_Run', 'Common_Workflow_Run.id', 'Common_Runtime.id')
      .selectAll('Common_Runtime')
      .select('Common_Workflow_Run.egcs_cn_completion')
      .where('Common_Runtime.egcs_cn_kind', '=', 'workflow')
      .where('Common_Runtime.egcs_cn_entitytype', '=', 'fundingcaseagreementcloseout')
      .where('Common_Runtime.egcs_cn_entityid', '=', closeoutId)
      .where('Common_Runtime.egcs_cn_state', 'in', ['pending', 'active', 'awaiting_action', 'paused'])
      .where('Common_Runtime._deleted', '=', false)
      .forUpdate(['Common_Runtime', 'Common_Workflow_Run']).executeTakeFirst()
    if (!activeRun) return await throwApiError(event, { statusCode: 409, code: 'AGREEMENT_CLOSEOUT_WORKFLOW_REQUIRED', key: 'apiErrors.request.invalid_status' })
    await cancelWorkflowRun(trx, activeRun, actor.id)
    return await trx.updateTable('Funding_Case_Agreement_Closeout').set({ egcs_fc_isopen: false })
      .where('id', '=', closeoutId).returningAll().executeTakeFirstOrThrow()
  }, { action: 'update', assignmentTarget, allowDuringCloseout: true, businessStatusMode: 'workflow' })
})
