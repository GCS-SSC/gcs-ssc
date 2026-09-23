import { authorize } from '~~/server/utils/authorize'
import { createAgencyRecommendationSchema } from '~~/server/utils/recommendation-schema-agency-routes'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  if (!isPositivePostgresBigintText(agencyId)) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  return await createAgencyRecommendationSchema(event)
})
