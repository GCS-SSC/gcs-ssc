import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertDraftAgreementAmendmentCapability, createAgreementAmendmentBudgetSnapshot } from '~~/server/utils/agreement-amendment'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const amendmentId = getRouterParam(event, 'amendmentId')
  if (!agreementId || !amendmentId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const context = await authorizeAgreementResource(event, 'create', agreementId, db)
  if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async trx => {
    const amendment = await assertDraftAgreementAmendmentCapability(event, trx, agreementId, amendmentId, ['budget', 'duration'])
    if (!('id' in amendment)) return amendment
    const existing = await trx.selectFrom('Funding_Case_Agreement_Budget_Version').select('id').where('egcs_fc_amendment', '=', amendmentId).where('_deleted', '=', false).executeTakeFirst()
    if (existing) return await badRequest(event, 'AGREEMENT_AMENDMENT_BUDGET_EXISTS', 'apiErrors.agreement.amendment_budget_exists')
    return { id: await createAgreementAmendmentBudgetSnapshot(trx, agreementId, amendmentId) }
  }, {
    action: 'create',
    assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId },
    businessStatusTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }
  })
})
