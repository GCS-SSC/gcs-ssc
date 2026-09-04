import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { patchAgreementAddress } from '~~/server/utils/agreement-address-routes'
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
    return await badRequest(event, 'AGREEMENT_ADDRESS_NOT_FOUND', 'apiErrors.agreement.address_not_found')
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
    async (trx, currentContext) => await patchAgreementAddress(
      event,
      trx,
      agreementId,
      childId,
      currentContext.agencyId
    ),
    { action: 'update' }
  )
})
