import { listGuidedHelpCatalog } from '~~/server/utils/guided-help'

// eslint-disable-next-line local/require-authorize -- operation independently authorizes its resolved owner or business screen
export default defineEventHandler(async event => {
  return listGuidedHelpCatalog(event, getRouterParam(event, 'agencyId') ?? '')
})
