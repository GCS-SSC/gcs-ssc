import { forbidden, notFound } from '~~/server/utils/api-errors'
import {
  canManageEntityAssignments,
  canAccessEntityAssignmentOwner,
  canReadEntityAssignments,
  resolveEntityAssignmentOwner,
  resolveAssignmentActor
} from '~~/server/utils/entity-assignment'
import { fetchRuntimeRecommendation } from '~~/server/utils/recommendation-runtime'
import { resolveAssignedItemGrant } from '~~/server/utils/rbac'
import { canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { resolveCompletionRuntimeEntityFromEntity } from '~~/server/utils/completion-runtime'
import type { Database } from '~~/shared/types/database'
import { isReviewRuntimeEntityWorkable, resolveReviewRuntimeEntityFromRecommendation } from '~~/server/utils/review-runtime-access'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

// eslint-disable-next-line local/require-authorize -- exact assignment or owning-entity/approval read is enforced below
export default defineEventHandler(async event => {
  const recommendationId = getRouterParam(event, 'recommendationId')
  if (!recommendationId) {
    return await notFound(event, 'RECOMMENDATION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  if (!isPositivePostgresBigintText(recommendationId)) {
    return await notFound(event, 'RECOMMENDATION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  const actor = await resolveAssignmentActor(event)
  const row = await fetchRuntimeRecommendation(event.context.$db, recommendationId)
  if (!row) return await notFound(event, 'RECOMMENDATION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const grant = await resolveAssignedItemGrant(
    actor.auth.userId,
    'commonrecommendation',
    recommendationId,
    event.context.$db
  )
  const isAssigned = grant !== null
  const owner = grant
    ? await resolveEntityAssignmentOwner(event.context.$db, 'commonrecommendation', recommendationId)
    : null
  const hasUpdateRole = owner
    ? await canAccessEntityAssignmentOwner(actor.auth, owner, 'update', event.context.$db)
    : false
  const canReadThroughOwnerOrRoster = await canReadEntityAssignments(
    event,
    'commonrecommendation',
    recommendationId
  )
  let hasAgreementViewerAccess = false
  let hasExactApprovalAccess = false
  let approvalSubmission: {
    approval_submission_packet: Database['Funding_Case_Agreement_Approval_Submission']['egcs_fc_packet'] | null
    approval_submission_hash: string | null
    approval_submission_submitted_at: Date | null
  } = {
    approval_submission_packet: null,
    approval_submission_hash: null,
    approval_submission_submitted_at: null
  }
  if (row.workflow_run_id && row.workflow_entity_type && row.workflow_entity_id) {
    const runtimeContext = await resolveCompletionRuntimeEntityFromEntity(
      event.context.$db,
      row.workflow_entity_type,
      row.workflow_entity_id
    )
    const agreementContext = runtimeContext?.agreementId
      ? await resolveAgreementScopeContext(runtimeContext.agreementId, event.context.$db)
      : null
    hasAgreementViewerAccess = agreementContext
      ? await canAccessAgreement(actor.auth, 'read', agreementContext.scope, event.context.$db)
      : false
    if (!hasAgreementViewerAccess) {
      hasExactApprovalAccess = Boolean(await event.context.$db.selectFrom('Common_Approval')
        .innerJoin('Common_User', 'Common_User.id', 'Common_Approval.egcs_cn_assigneduser')
        .innerJoin('Common_Routing_Slip', 'Common_Routing_Slip.id', 'Common_Approval.egcs_cn_routingslip')
        .innerJoin('Common_Runtime_Item as Routing_Item', 'Routing_Item.id', 'Common_Routing_Slip.egcs_cn_runtimeitem')
        .select('Common_Approval.id')
        .where('Common_User.egcs_cn_auth_user_id', '=', actor.auth.userId)
        .where('Common_User._deleted', '=', false)
        .where('Common_Routing_Slip.egcs_cn_entitytype', '=', 'commonrecommendation')
        .where('Common_Routing_Slip.egcs_cn_entityid', '=', recommendationId)
        .where('Common_Routing_Slip._deleted', '=', false)
        .where('Routing_Item.egcs_cn_runtime', '=', row.runtimeId)
        .where('Routing_Item.egcs_cn_parentruntimeitem', '=', row.runtimeItemId)
        .where('Routing_Item.egcs_cn_kind', '=', 'routing_slip')
        .where('Routing_Item._deleted', '=', false)
        .executeTakeFirst())
    }
    if (hasAgreementViewerAccess || hasExactApprovalAccess) {
      const submission = await event.context.$db.selectFrom('Funding_Case_Agreement_Approval_Submission')
        .select([
          'egcs_fc_packet as approval_submission_packet',
          'egcs_fc_canonicalhash as approval_submission_hash',
          'egcs_fc_submittedat as approval_submission_submitted_at'
        ])
        .where('egcs_fc_workflowrun', '=', row.workflow_run_id)
        .executeTakeFirst()
      if (submission) approvalSubmission = submission
    }
  }
  if (!canReadThroughOwnerOrRoster && !isAssigned && !hasExactApprovalAccess) return await forbidden(event)
  const approvalRuntime = row.runtimeState === 'awaiting_action'
    || row.runtimeState === 'approved'
    || row.runtimeState === 'denied'
    ? await event.context.$db.selectFrom('Common_Routing_Slip')
        .innerJoin('Common_Runtime_Item as Routing_Item', 'Routing_Item.id', 'Common_Routing_Slip.egcs_cn_runtimeitem')
        .select([
          'Common_Routing_Slip.id as routingSlipId',
          'Routing_Item.egcs_cn_runtime as approvalRuntimeId',
          'Routing_Item.egcs_cn_state as approvalRuntimeState'
        ])
        .where('Common_Routing_Slip.egcs_cn_entitytype', '=', 'commonrecommendation')
        .where('Common_Routing_Slip.egcs_cn_entityid', '=', recommendationId)
        .where('Routing_Item.egcs_cn_parentruntimeitem', '=', row.runtimeItemId)
        .where('Common_Routing_Slip._deleted', '=', false)
        .where('Routing_Item._deleted', '=', false)
        .orderBy('Common_Routing_Slip.id', 'desc')
        .executeTakeFirst()
    : null
  const { publicationDefinition: _publicationDefinition, ...recommendation } = row
  const runtimeContext = await resolveReviewRuntimeEntityFromRecommendation(event.context.$db, recommendationId)
  const isWorkable = runtimeContext
    ? await isReviewRuntimeEntityWorkable(event.context.$db, runtimeContext)
    : false
  return {
    ...recommendation,
    ...approvalSubmission,
    approvalRuntimeId: approvalRuntime ? String(approvalRuntime.approvalRuntimeId) : null,
    approvalRuntimeState: approvalRuntime?.approvalRuntimeState ?? null,
    routingSlipId: approvalRuntime ? String(approvalRuntime.routingSlipId) : null,
    can_read: true,
    can_update: row.runtimeState === 'active' && isWorkable
      && grant?.actions.has('update') === true && hasUpdateRole,
    can_manage_assignments: await canManageEntityAssignments(event, 'commonrecommendation', recommendationId),
    is_assigned: isAssigned,
    is_primary: grant?.isPrimary === true
  }
})
