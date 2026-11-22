import { defineEventHandler, getRouterParam } from 'h3'
import { authorize } from '~~/server/utils/authorize'
import { assertActiveAgencyProfile } from '~~/server/utils/agency-auth'
import { notFound } from '~~/server/utils/api-errors'
import { isAuthoringGenerationEnabled } from '~~/server/utils/openai-authoring'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  if (!isPositivePostgresBigintText(agencyId)) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  await assertActiveAgencyProfile(event, agencyId)
  return { enabled: await isAuthoringGenerationEnabled(event, agencyId) }
})
