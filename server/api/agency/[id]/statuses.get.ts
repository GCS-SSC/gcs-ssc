import { authorize } from '~~/server/utils/authorize'
import { statusCatalogService } from '~~/server/utils/status-catalog'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { withActiveAgencyReadTransaction } from '~~/server/utils/agency-auth'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id')
  if (!agencyId) return await badRequest(event, 'MISSING_AGENCY_ID', 'apiErrors.request.missing_agency_id')
  if (!isPositivePostgresBigintText(agencyId)) return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  const catalog = event.context.$statusCatalog ?? statusCatalogService
  return await withActiveAgencyReadTransaction(event, agencyId, async trx =>
    catalog ? await catalog.getAgency(trx, agencyId, true) : [])
})
