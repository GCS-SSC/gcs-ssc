import { authorize } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import { canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { patchAgreementBudgetFiscalYear } from '~~/server/utils/agreement-budget'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const childId = getRouterParam(event, 'childId')

  if (!agreementId || !childId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(childId)) {
    return await badRequest(event, 'AGREEMENT_BUDGET_FISCAL_YEAR_NOT_FOUND', 'apiErrors.agreement.budget_fiscal_year_not_found')
  }

  const agreementContext = await resolveAgreementScopeContext(agreementId, db)
  if (!agreementContext) {
    return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  await authorize(event, 'agreement', 'update', async ({ context }) => {
    const canUpdate = await canAccessAgreement(context, 'update', agreementContext.scope, db)
    if (canUpdate) return { bypass: true }
    return { denied: true }
  })

  return await executeFreshAuthorizedAgreementWrite(
    event,
    db,
    agreementId,
    agreementContext,
    async (trx, currentContext) => await patchAgreementBudgetFiscalYear(
      event,
      trx,
      agreementId,
      childId,
      currentContext.streamId
    ),
    { action: 'update', blocksApprovalSubmission: true }
  )
})
