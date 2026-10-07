import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertAgreementAmendmentExists, isAgreementAmendable } from '~~/server/utils/agreement-amendment'
import { withBusinessRecordState } from '~~/server/utils/business-record-state'
import { resolveBusinessStatusProtection } from '~~/server/utils/business-status-runtime'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { hasRiskRatingRuns, isRiskRatingWorkflowManaged, resolveLatestRiskRating } from '~~/server/utils/agreement-risk-rating'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  const amendmentId = getRouterParam(event, 'amendmentId')
  if (!agreementId || !amendmentId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  return await executeFreshReadSnapshot(event, async db => {
    const context = await authorizeAgreementResource(event, 'read', agreementId, db, {
      assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId },
      freshAuth: true
    })
    if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

    const amendment = await assertAgreementAmendmentExists(event, db, agreementId, amendmentId)
    if (!('id' in amendment)) return amendment
    const [types, subtypes, budgetVersion, activityVersion, agreementAmendable, amendmentsWithState, statusProtection] = await Promise.all([
      db.selectFrom('Funding_Case_Agreement_Amendment_Type')
        .innerJoin('Transfer_Payment_Amendment_Type', 'Transfer_Payment_Amendment_Type.id', 'Funding_Case_Agreement_Amendment_Type.egcs_fc_amendmenttype')
        .select(['Transfer_Payment_Amendment_Type.id as id', 'Transfer_Payment_Amendment_Type.egcs_tp_amended as egcs_tp_amended', 'Transfer_Payment_Amendment_Type.egcs_tp_name_en as egcs_tp_name_en', 'Transfer_Payment_Amendment_Type.egcs_tp_name_fr as egcs_tp_name_fr'])
        .where('Funding_Case_Agreement_Amendment_Type.egcs_fc_amendment', '=', amendmentId)
        .where('Funding_Case_Agreement_Amendment_Type._deleted', '=', false).execute(),
      db.selectFrom('Funding_Case_Agreement_Amendment_Subtype')
        .innerJoin('Transfer_Payment_Amendment_Subtype', 'Transfer_Payment_Amendment_Subtype.id', 'Funding_Case_Agreement_Amendment_Subtype.egcs_fc_amendmentsubtype')
        .select(['Transfer_Payment_Amendment_Subtype.id as id', 'Transfer_Payment_Amendment_Subtype.egcs_tp_name_en as egcs_tp_name_en', 'Transfer_Payment_Amendment_Subtype.egcs_tp_name_fr as egcs_tp_name_fr'])
        .where('Funding_Case_Agreement_Amendment_Subtype.egcs_fc_amendment', '=', amendmentId)
        .where('Funding_Case_Agreement_Amendment_Subtype._deleted', '=', false).execute(),
      db.selectFrom('Funding_Case_Agreement_Budget_Version').select('id').where('egcs_fc_amendment', '=', amendmentId).where('_deleted', '=', false).executeTakeFirst(),
      db.selectFrom('Funding_Case_Agreement_Activity_Version').select('id').where('egcs_fc_amendment', '=', amendmentId).where('_deleted', '=', false).executeTakeFirst(),
      isAgreementAmendable(db, agreementId),
      withBusinessRecordState(db, 'fundingcaseamendment', [amendment]),
      resolveBusinessStatusProtection(db, 'fundingcaseamendment', amendmentId)
    ])
    const riskTarget = { entityType: 'fundingcaseamendment' as const, entityId: amendmentId }
    const [riskManaged, riskHistory, latestRiskRating] = await Promise.all([
      isRiskRatingWorkflowManaged(db, { ...riskTarget, streamId: context.streamId }),
      hasRiskRatingRuns(db, riskTarget), resolveLatestRiskRating(db, riskTarget)
    ])
    const completed = Boolean(amendmentsWithState[0]?.isCompleted)
    const actor = await requireAuthContext(event)
    const hasUpdateRole = actor.userAbilities.authorize('agreement', 'update', context.scope)
    return {
      ...amendmentsWithState[0],
      egcs_fc_changerisk: completed ? amendment.egcs_fc_changerisk : riskManaged || amendment.egcs_fc_changerisk,
      risk_workflow_managed: riskManaged,
      has_risk_rating_runs: riskHistory,
      latest_risk_rating_run: latestRiskRating,
      risk_rating_available: riskManaged || riskHistory,
      amendment_types: types,
      amendment_type_ids: types.map(type => String(type.id)),
      amendment_subtypes: subtypes,
      amendment_subtype_ids: subtypes.map(subtype => String(subtype.id)),
      has_budget_snapshot: Boolean(budgetVersion),
      has_activity_snapshot: Boolean(activityVersion),
      can_create_snapshot: !completed && hasUpdateRole && agreementAmendable && statusProtection?.isDraft === true,
      can_edit: !completed && hasUpdateRole && agreementAmendable && statusProtection?.isDraft === true,
      can_edit_scope: !completed && hasUpdateRole && agreementAmendable && statusProtection?.isDraft === true,
      can_delete_documents: !completed && hasUpdateRole && agreementAmendable && statusProtection?.isDraft === true && actor.userAbilities.authorize('agreement', 'delete', context.scope),
      can_cancel: hasUpdateRole && amendment.egcs_fc_isopen
    }
  })
})
