import { authorize } from '~~/server/utils/authorize'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { createAgencyRecommendationMember } from '~~/server/utils/recommendation-set-agency-routes'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  if (!isPositivePostgresBigintText(agencyId)) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  return await createAgencyRecommendationMember(event)
})
