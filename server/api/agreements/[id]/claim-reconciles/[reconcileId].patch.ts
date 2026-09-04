import {
  patchAgreementClaimReconcile,
  prepareAgreementClaimRoute
} from '~~/server/utils/agreement-claim'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { isDecimalDatabaseId } from '~~/server/utils/database-id'

export default defineEventHandler(async event => {
  const reconcileId = getRouterParam(event, 'reconcileId')
  if (!reconcileId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isDecimalDatabaseId(reconcileId)) {
    return await notFound(event, 'CLAIM_RECONCILIATION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  const prepared = await prepareAgreementClaimRoute(event, 'update', {
    entityType: 'fundingclaimreconcile',
    entityId: reconcileId
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  return await patchAgreementClaimReconcile(event, db, agreementId, agreementContext, reconcileId)
})
