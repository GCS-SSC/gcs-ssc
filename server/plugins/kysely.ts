import { randomUUID } from 'node:crypto'
import { getMigrationPromise } from '../utils/migration-readiness'
import type { AccessLogRequest } from '../utils/access-log-queue'

export default defineNitroPlugin(async nitroApp => {
  const dbLease = await acquireDbLease()

  nitroApp.hooks.hook('request', event => {
    const accessRequest: AccessLogRequest = { complete: false }
    event.context.accessLogRequest = accessRequest
    // A disconnected client may never reach Nitro's afterResponse hook.
    event.node.res.once('close', () => {
      accessRequest.complete = true
    })
    event.context.auditRequestId = randomUUID()
    setResponseHeader(event, 'X-Request-ID', event.context.auditRequestId)
    event.context.$db = dbLease.database
    event.context.$dbHealthCheck = dbLease.healthCheck
  })

  nitroApp.hooks.hook('afterResponse', event => {
    event.context.accessLogRequest.complete = true
  })

  nitroApp.hooks.hookOnce('close', async () => {
    // Nitro can request shutdown before its asynchronous startup plugins finish.
    // Keep this lease until startup settles so the worker cannot exit mid-migration.
    await getMigrationPromise(dbLease.generationId)?.catch(() => {
      // Startup already reports its failure; shutdown must still release the lease.
    })
    await dbLease.release()
  })
})
