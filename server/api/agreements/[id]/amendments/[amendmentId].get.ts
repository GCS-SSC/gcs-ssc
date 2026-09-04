import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertAgreementAmendmentExists, isAgreementAmendable } from '~~/server/utils/agreement-amendment'
import { withBusinessRecordState } from '~~/server/utils/business-record-state'
import { resolveBusinessStatusProtection } from '~~/server/utils/business-status-runtime'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

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
    return {
      ...amendmentsWithState[0],
      amendment_types: types,
      amendment_type_ids: types.map(type => String(type.id)),
      amendment_subtypes: subtypes,
      amendment_subtype_ids: subtypes.map(subtype => String(subtype.id)),
      has_budget_snapshot: Boolean(budgetVersion),
      has_activity_snapshot: Boolean(activityVersion),
      can_create_snapshot: agreementAmendable && statusProtection?.isDraft === true,
      can_edit: agreementAmendable && statusProtection?.isDraft === true,
      can_edit_scope: agreementAmendable && statusProtection?.isDraft === true,
      can_cancel: amendment.egcs_fc_isopen
    }
  })
})
