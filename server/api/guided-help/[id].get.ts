import { readGuidedHelp } from '~~/server/utils/guided-help'

// eslint-disable-next-line local/require-authorize -- operation independently authorizes its resolved owner or business screen
export default defineEventHandler(async event => {
  return readGuidedHelp(event, getRouterParam(event, 'id') ?? '')
})
