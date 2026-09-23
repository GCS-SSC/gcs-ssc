import { authorize } from '~~/server/utils/authorize'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { publishAgencyRecommendationSet } from '~~/server/utils/recommendation-set-agency-routes'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id') ?? ''
  if (!isPositivePostgresBigintText(agencyId)) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  return await publishAgencyRecommendationSet(event)
})
