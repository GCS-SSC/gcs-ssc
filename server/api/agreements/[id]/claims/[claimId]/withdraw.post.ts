import {
  executeAgreementClaimMutation,
  prepareAgreementClaimRoute,
  withdrawAgreementClaim
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

  const { agreementId, agreementContext, db } = prepared

  return await executeAgreementClaimMutation(
    event,
    db,
    agreementId,
    agreementContext,
    [{ type: 'claim', id: claimId }],
    async trx => await withdrawAgreementClaim(event, trx, agreementId, claimId),
    { action: 'update', businessStatusMode: 'workflow' }
  )
})
