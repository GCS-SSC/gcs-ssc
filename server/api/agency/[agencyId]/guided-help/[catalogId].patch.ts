import { defineEventHandler, getRouterParam } from 'h3'
import { requireAuthContext } from '~~/server/utils/authorize'
import { updateGuidedHelpCatalog } from '~~/server/utils/guided-help'
import { GuidedHelpCatalogSettingsSchema } from '~~/shared/types/schemas/guided-help'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const input = await readValidatedBodyI18n(event, GuidedHelpCatalogSettingsSchema)
  return updateGuidedHelpCatalog(event, getRouterParam(event, 'agencyId') ?? '', getRouterParam(event, 'catalogId') ?? '', input)
})
