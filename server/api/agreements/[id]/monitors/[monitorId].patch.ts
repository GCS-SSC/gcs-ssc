import {
  patchAgreementMonitorForRoute,
  prepareAgreementMonitorRoute
} from '~~/server/utils/agreement-monitor'
import { badRequest } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  const monitorId = getRouterParam(event, 'monitorId')
  if (!monitorId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const prepared = await prepareAgreementMonitorRoute(event, 'update', {
    entityType: 'fundingcasemonitor',
    entityId: monitorId
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  return await patchAgreementMonitorForRoute(
    event,
    db,
    agreementId,
    agreementContext,
    monitorId
  )
})
