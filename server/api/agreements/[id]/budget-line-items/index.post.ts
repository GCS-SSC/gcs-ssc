import { authorize } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import { canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { createAgreementBudgetLineItem } from '~~/server/utils/agreement-budget'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')

  if (!agreementId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const agreementContext = await resolveAgreementScopeContext(agreementId, db)
  if (!agreementContext) {
    return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  await authorize(event, 'agreement', 'create', async ({ context }) => {
    const canCreate = await canAccessAgreement(context, 'create', agreementContext.scope, db)
    if (canCreate) return { bypass: true }
    return { denied: true }
  })

  return await createAgreementBudgetLineItem(event, db, agreementId, agreementContext)
})
