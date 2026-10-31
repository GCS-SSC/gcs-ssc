import { parseSafeDecimal } from '~~/shared/utils/decimal'
import { defineEventHandler } from 'h3'
import { requireAuthContext } from '~~/server/utils/authorize'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { forbidden } from '~~/server/utils/api-errors'
import { resolveApprovalItemGrant } from '@gcs-ssc/authorization/server'
import { getWorkflowRuntime } from '~~/server/utils/workflow-runtime'
import { resolveCompletionRuntimeEntityFromEntity } from '~~/server/utils/completion-runtime'
import { WorkflowRuntimeQuerySchema } from '~~/shared/types/schemas/workflow'

/** Exact approval workspace: exposes its retained packet and routing slip, without other workflow work. */
export default defineEventHandler(async event => {
  const auth = await requireAuthContext(event)
  const query = await getValidatedQueryI18n(event, WorkflowRuntimeQuerySchema)
  if (query.purpose !== 'approval_submission') return await forbidden(event)
  const db = event.context.$db
  const context = await resolveCompletionRuntimeEntityFromEntity(db, query.entityType, query.entityId)
  if (!context) return await forbidden(event)
  const grant = await resolveApprovalItemGrant(auth.userId, query, db, { runtimeId: query.runtimeId })
  if (!grant) return await forbidden(event)
  const stage = await db.selectFrom('Common_Approval')
    .innerJoin('Common_Routing_Slip', 'Common_Routing_Slip.id', 'Common_Approval.egcs_cn_routingslip')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Routing_Slip.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Common_Runtime_Item.egcs_cn_runtime')
    .select(['Common_Runtime.id as runtimeId', 'Common_Routing_Slip.id as routingSlipId',
      'Common_Runtime_Item.id as runtimeItemId', 'Common_Runtime_Item.egcs_cn_state as runtimeState',
      'Common_Runtime_Item.egcs_cn_order as order'])
    .where('Common_Approval.id', '=', grant.approvalId)
    .where('Common_Routing_Slip._deleted', '=', false)
    .where('Common_Runtime_Item._deleted', '=', false)
    .where('Common_Runtime_Item.egcs_cn_parentruntimeitem', 'is', null)
    .where('Common_Runtime.egcs_cn_kind', '=', 'workflow')
    .where('Common_Runtime.egcs_cn_purpose', '=', 'approval_submission')
    .where('Common_Runtime.egcs_cn_entitytype', '=', query.entityType)
    .where('Common_Runtime.egcs_cn_entityid', '=', query.entityId)
    .where('Common_Runtime._deleted', '=', false)
    .executeTakeFirst()
  if (!stage || (query.runtimeId && query.runtimeId !== String(stage.runtimeId))) return await forbidden(event)
  const runtime = await getWorkflowRuntime(db, query.entityType, query.entityId, String(stage.runtimeId), 'approval_submission')
  if (!runtime.current) return await forbidden(event)
  return {
    current: runtime.current,
    submission: runtime.submission,
    sourceApprovalStage: { routingSlipId: stage.routingSlipId, runtimeItemId: stage.runtimeItemId,
      runtimeState: stage.runtimeState, order: parseSafeDecimal(String(stage.order)) },
    history: [], previous: [], steps: [], recommendations: [], dataCollections: [], reviews: [],
    reviewSets: [], recommendationSets: [], workflowItems: [], transitions: [], runtimeTransitions: [], ownerBlockers: [],
    canStart: false, canRetry: false, canCancel: false, canResumeOwners: false,
    applicable: { workflow: null, completion: null },
    plan: { review: null, recommendations: [], dataCollections: [], has_final_approval: true }
  }
})
