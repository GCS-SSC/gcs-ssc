import { badRequest, notFound } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { resolveDraftAgreementAmendmentActivityVersion } from '~~/server/utils/agreement-amendment'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const amendmentId = getRouterParam(event, 'amendmentId')
  const childId = getRouterParam(event, 'childId')
  if (!agreementId || !amendmentId || !childId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const agreementContext = await authorizeAgreementResource(event, 'delete', agreementId, db)
  if (!agreementContext) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async trx => {
    const versionId = await resolveDraftAgreementAmendmentActivityVersion(event, trx, agreementId, amendmentId)
    if (typeof versionId !== 'string') return versionId
    const existing = await trx.selectFrom('Funding_Case_Agreement_Activity').select('id').where('id', '=', childId).where('egcs_fc_fundingagreement', '=', agreementId).where('egcs_fc_activityversion', '=', versionId).where('_deleted', '=', false).executeTakeFirst()
    if (!existing) return await notFound(event, 'AGREEMENT_ACTIVITY_NOT_FOUND', 'apiErrors.agreement.activity_not_found')
    await trx.updateTable('Funding_Case_Agreement_Outcome_Activity').set({ _deleted: true }).where('egcs_fc_activity', '=', childId).where('_deleted', '=', false).execute()
    await trx.updateTable('Funding_Case_Agreement_Responsible_Party_Activity').set({ _deleted: true }).where('egcs_fc_activity', '=', childId).where('_deleted', '=', false).execute()
    await trx.updateTable('Funding_Case_Agreement_Activity').set({ _deleted: true }).where('id', '=', childId).where('egcs_fc_activityversion', '=', versionId).where('_deleted', '=', false).execute()
    return { success: true }
  }, {
    action: 'delete',
    assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId },
    businessStatusTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }
  })
})
