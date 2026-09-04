import { authorize } from '~~/server/utils/authorize'

/** Returns the authenticated user's canonical static permission grants. */
export default defineEventHandler(async event => {
  const context = await authorize(event, 'system', 'read', async () => ({ bypass: true }))
  return { grants: context.userAbilities.getGrants() }
})
