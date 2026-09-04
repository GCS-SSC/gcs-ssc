import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { buildAgreementCloseoutReadiness } from '~~/server/utils/agreement-closeout'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const db = event.context.$db
  return await db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const context = await authorizeAgreementResource(event, 'read', agreementId, trx)
    if (!context) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    const readiness = await buildAgreementCloseoutReadiness(trx, agreementId)
    if (!readiness) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    return readiness
  })
})
