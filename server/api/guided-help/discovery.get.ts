import { discoverCollectionGuidedHelp } from '~~/server/utils/guided-help'

// eslint-disable-next-line local/require-authorize -- collection discovery filters canonical business visibility and published role audiences
export default defineEventHandler(async event => {
  const query = getQuery(event)
  return discoverCollectionGuidedHelp(event, typeof query.view === 'string' ? query.view : '')
})
