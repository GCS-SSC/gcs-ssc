import { acquireDbLease, type DatabaseLease } from '../utils/db'
import { getMigrationPromise } from '../utils/migration-readiness'
import { activateEnabledExtensionNitroPlugins } from '../utils/extension-nitro-plugins'
import { getRegisteredExtensions } from '../utils/extensions'
import { createScheduledExtensionWriteAuthorization } from '../utils/extension-scheduled-import'
import { withAuditExecution, withoutAccessLogCapture } from '../utils/audit-context'
import { prepareQueueSchedules, runQueueHandler } from '../utils/queue'
import { getRegisteredQueueHandlers, getQueueEnabledExtensionKeys } from '../utils/queue-registry'
import type { HostQueueContext } from '../utils/queue-registry'
import { runProcessQueueHandler } from '../utils/queue-process'

export default defineNitroPlugin(app => {
  const running = new Map<string, Promise<void>>()
  let lease: DatabaseLease | undefined
  let stopped = false
  let active: Promise<void> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let signalClose = () => {}
  const closed = new Promise<void>(resolve => {
    signalClose = resolve
  })

  // Generation acquisition can await an older generation's retirement. Local jobs
  // never wait for that acquisition, and a late acquisition is released on close.
  void acquireDbLease().then(async acquired => {
    if (stopped) await acquired.release()
    else lease = acquired
  }).catch(error => console.error('Queue database acquisition failed', error))

  /** Offers shared cycles without blocking local work on primary database availability. */
  const tickCluster = async (): Promise<void> => {
    const currentLease = lease
    if (!currentLease) return
    const migration = getMigrationPromise(currentLease.generationId)
    if (!migration) return
    await Promise.race([migration, closed])
    if (stopped) return
    const db = currentLease.database
    await activateEnabledExtensionNitroPlugins(db, app, await getRegisteredExtensions())
    const handlers = getRegisteredQueueHandlers(app).filter(handler => handler.executionScope !== 'process')
    const enabledKeys = await withoutAccessLogCapture(() => getQueueEnabledExtensionKeys(db))
    if (stopped) return
    await prepareQueueSchedules(db, handlers)
    if (stopped) return
    const context: HostQueueContext = {
      db,
      createWriteAuthorization: createScheduledExtensionWriteAuthorization,
      runForAgency: (agencyId, operation) => withAuditExecution({ type: 'agency', agencyId }, operation)
    }
    for (const handler of handlers) {
      const mayDispatch = () => !stopped && getRegisteredQueueHandlers(app).includes(handler)
      if (!mayDispatch()) continue
      if (running.has(handler.id) || (handler.extensionKey && !enabledKeys.has(handler.extensionKey))) continue
      const work = runQueueHandler(db, handler, context, mayDispatch)
        .then(() => {})
        .catch(error => console.error(`Queue dispatch failed: ${handler.id}`, error))
        .finally(() => { running.delete(handler.id) })
      running.set(handler.id, work)
    }
  }

  /** A single housekeeping timer offers every process and cluster queue level. */
  const poll = (): void => {
    if (stopped) return
    for (const handler of getRegisteredQueueHandlers(app)) {
      if (handler.executionScope !== 'process' || running.has(handler.id)) continue
      const work = runProcessQueueHandler(handler, app).then(() => {})
        .catch(error => console.error(`Process queue dispatch failed: ${handler.id}`, error))
        .finally(() => { running.delete(handler.id) })
      running.set(handler.id, work)
    }
    if (!active) {
      active = tickCluster().catch(error => console.error('Queue tick failed', error))
        .finally(() => { active = undefined })
    }
    timer = setTimeout(poll, 5000)
    timer.unref?.()
  }

  app.hooks.hookOnce('close', async () => {
    stopped = true
    signalClose()
    clearTimeout(timer)
    try {
      await active
      await Promise.all(running.values())
    } finally {
      await lease?.release()
    }
  })
  // Starting on the next event-loop turn lets startup plugins register first.
  timer = setTimeout(poll, 0)
  timer.unref?.()
})
