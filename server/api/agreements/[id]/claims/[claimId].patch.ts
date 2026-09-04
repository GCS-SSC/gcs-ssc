import {
  patchAgreementClaimForRoute,
  prepareAgreementClaimRoute
} from '~~/server/utils/agreement-claim'
import { badRequest } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  const claimId = getRouterParam(event, 'claimId')
  if (!claimId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const prepared = await prepareAgreementClaimRoute(event, 'update', {
    entityType: 'fundingcaseagreementclaim',
    entityId: claimId
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  return await patchAgreementClaimForRoute(event, prepared.db, prepared.agreementId, prepared.agreementContext, claimId)
})
