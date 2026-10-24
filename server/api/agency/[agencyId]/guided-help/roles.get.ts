import { defineEventHandler, getRouterParam } from 'h3'
import { listGuidedHelpRoles } from '~~/server/utils/guided-help'

// eslint-disable-next-line local/require-authorize -- operation independently authorizes its resolved owner or business screen
export default defineEventHandler(async event => {
  return listGuidedHelpRoles(event, getRouterParam(event, 'agencyId') ?? '')
})
