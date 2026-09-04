import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertDraftAgreementAmendment, createAgreementAmendmentActivitySnapshot } from '~~/server/utils/agreement-amendment'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const amendmentId = getRouterParam(event, 'amendmentId')
  if (!agreementId || !amendmentId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const context = await authorizeAgreementResource(event, 'create', agreementId, db)
  if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async trx => {
    const amendment = await assertDraftAgreementAmendment(event, trx, agreementId, amendmentId)
    if (!('id' in amendment)) return amendment
    const enabled = await trx.selectFrom('Funding_Case_Agreement_Amendment_Type')
      .innerJoin('Transfer_Payment_Amendment_Type', 'Transfer_Payment_Amendment_Type.id', 'Funding_Case_Agreement_Amendment_Type.egcs_fc_amendmenttype')
      .select('Funding_Case_Agreement_Amendment_Type.id').where('Funding_Case_Agreement_Amendment_Type.egcs_fc_amendment', '=', amendmentId)
      .where('Funding_Case_Agreement_Amendment_Type._deleted', '=', false).where('Transfer_Payment_Amendment_Type._deleted', '=', false)
      .where('Transfer_Payment_Amendment_Type.egcs_tp_amended', '=', 'activities').executeTakeFirst()
    if (!enabled) return await badRequest(event, 'AGREEMENT_AMENDMENT_ACTIVITIES_NOT_ENABLED', 'apiErrors.agreement.amendment_activities_not_enabled')
    const existing = await trx.selectFrom('Funding_Case_Agreement_Activity_Version').select('id').where('egcs_fc_amendment', '=', amendmentId).where('_deleted', '=', false).executeTakeFirst()
    if (existing) return await badRequest(event, 'AGREEMENT_AMENDMENT_ACTIVITIES_EXIST', 'apiErrors.agreement.amendment_activities_exist')
    return { id: await createAgreementAmendmentActivitySnapshot(trx, agreementId, amendmentId) }
  }, {
    action: 'create',
    assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId },
    businessStatusTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }
  })
})
