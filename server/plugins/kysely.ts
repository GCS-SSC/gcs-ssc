import { setResponseHeader } from 'h3'
import { defineNitroPlugin } from 'nitropack/runtime'
import { randomUUID } from 'node:crypto'
import { getMigrationPromise } from '../utils/migration-readiness'
import type { AccessLogRequest } from '../utils/access-log-queue'

type RequestPluginState =
  | { kind: 'starting' }
  | { kind: 'active'; removeHooks: (() => void)[] }
  | { kind: 'closed' }

export default defineNitroPlugin(async nitroApp => {
  const lifecycle: { state: RequestPluginState } = { state: { kind: 'starting' } }
  nitroApp.hooks.hookOnce('close', async () => {
    const previous = lifecycle.state
    lifecycle.state = { kind: 'closed' }
    if (previous.kind === 'active') {
      for (const removeHook of previous.removeHooks) removeHook()
    }

    const closingLease = await acquisition.catch(() => undefined)
    if (!closingLease) return
    // Shutdown joins both acquisition and startup before releasing this generation.
    await getMigrationPromise(closingLease.generationId)?.catch(() => {
      // Startup already reports its failure; shutdown must still release the lease.
    })
    await closingLease.release()
  })

  const acquisition = acquireDbLease()
  const dbLease = await acquisition
  if (lifecycle.state.kind === 'closed') return

  const removeRequest = nitroApp.hooks.hook('request', event => {
    if (lifecycle.state.kind !== 'active') return
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

  const removeAfterResponse = nitroApp.hooks.hook('afterResponse', event => {
    if (lifecycle.state.kind !== 'active') return
    event.context.accessLogRequest.complete = true
  })

  lifecycle.state = { kind: 'active', removeHooks: [removeRequest, removeAfterResponse] }
})
