import { defineEventHandler, getRouterParam } from 'h3'
import { readGuidedHelpCatalog } from '~~/server/utils/guided-help'

// eslint-disable-next-line local/require-authorize -- operation independently authorizes its resolved owner or business screen
export default defineEventHandler(async event => {
  return readGuidedHelpCatalog(event, getRouterParam(event, 'agencyId') ?? '', getRouterParam(event, 'catalogId') ?? '')
})
