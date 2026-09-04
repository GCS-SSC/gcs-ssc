import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { patchAgreementActivity } from '~~/server/utils/agreement-activity'
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
    return await badRequest(event, 'AGREEMENT_ACTIVITY_NOT_FOUND', 'apiErrors.agreement.activity_not_found')
  }

  const agreementContext = await authorizeAgreementResource(event, 'update', agreementId, db)
  if (!agreementContext) {
    return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  return await executeFreshAuthorizedAgreementWrite(
    event,
    db,
    agreementId,
    agreementContext,
    async (trx, currentContext) => await patchAgreementActivity(
      event,
      trx,
      agreementId,
      currentContext.profileId,
      childId
    ),
    { action: 'update', blocksApprovalSubmission: true }
  )
})
