import { listSharedGuidedHelp } from '~~/server/utils/guided-help'

// eslint-disable-next-line local/require-authorize -- operation independently authorizes its resolved owner or business screen
export default defineEventHandler(async event => {
  const query = getQuery(event)
  return listSharedGuidedHelp(event, typeof query.agencyId === 'string' ? query.agencyId : '')
})
