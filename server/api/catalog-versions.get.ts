import { defineEventHandler, setResponseHeader } from 'h3'
import { authorize } from '~~/server/utils/authorize'
import { auth } from '~~/server/utils/auth'
import { unauthorized } from '~~/server/utils/api-errors'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { readCatalogVersions } from '~~/server/utils/catalog-versions'

/** Returns only catalog revisions visible through existing business and approval grants. */
export default defineEventHandler(async event => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  // Better Auth uses the root database, outside PGlite's exclusive snapshot lease.
  const session = await auth.api.getSession({ headers: event.headers })
  return await executeFreshReadSnapshot(event, async () => {
    const context = await authorize(event, 'system', 'read', async () => ({ bypass: true }))
    if (!session || String(session.user.id) !== context.userId) return await unauthorized(event)
    return {
      accountId: context.userId,
      // Better Auth's database row ID is not its authentication token.
      sessionId: session.session.id,
      agencies: await readCatalogVersions(event.context.$db, context.userId, context.userAbilities.getGrants())
    }
  }, { authorization: 'snapshot' })
})
