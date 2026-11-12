import { defineNitroPlugin } from 'nitropack/runtime'
import { acquireDbLease, type DatabaseLease } from '../utils/db'
import { getMigrationPromise } from '../utils/migration-readiness'
import { activateEnabledExtensionNitroPlugins } from '../utils/extension-nitro-plugins'
import { getRegisteredExtensions } from '../utils/extensions'
import { createScheduledExtensionWriteAuthorization } from '../utils/extension-scheduled-import'
import { withAuditExecution, withSystemAudit, withoutAccessLogCapture } from '../utils/audit-context'
import { prepareQueueSchedules, runQueueHandler } from '../utils/queue'
import { getRegisteredQueueHandlers, getQueueEnabledExtensionKeys } from '../utils/queue-registry'
import type { HostQueueContext } from '../utils/queue-registry'
import { runProcessQueueHandler } from '../utils/queue-process'
import { queuePollDelayMs, resolveEnabledQueueLevels } from '../utils/queue-config'

type QueueRunnerState =
  | { kind: 'starting' }
  | { kind: 'polling'; timer: ReturnType<typeof setTimeout> }
  | { kind: 'stopping' }
  | { kind: 'stopped' }

type QueueDatabaseState =
  | { kind: 'acquiring' }
  | { kind: 'ready'; lease: DatabaseLease }
  | { kind: 'unavailable' }
  | { kind: 'released' }

type QueueTickState = { kind: 'idle' } | { kind: 'running'; work: Promise<void> }

export default defineNitroPlugin(app => {
  const levels = resolveEnabledQueueLevels()
  if (!levels.length) return
  const enabled = (level: number) => levels.some(definition => definition.level === level)
  const running = new Map<string, Promise<void>>()
  let database: QueueDatabaseState = { kind: 'acquiring' }
  let runner: QueueRunnerState = { kind: 'starting' }
  let clusterTick: QueueTickState = { kind: 'idle' }
  const isRunning = () => runner.kind === 'starting' || runner.kind === 'polling'
  let signalClose = () => {}
  const closed = new Promise<void>(resolve => {
    signalClose = resolve
  })

  // Generation acquisition can await an older generation's retirement. Local jobs
  // never wait for that acquisition, and a late acquisition is released on close.
  void acquireDbLease().then(async acquired => {
    if (!isRunning()) await acquired.release()
    else database = { kind: 'ready', lease: acquired }
  }).catch(error => {
    if (database.kind === 'acquiring') database = { kind: 'unavailable' }
    console.error('Queue database acquisition failed', error)
  })

  /** Offers shared cycles without blocking local work on primary database availability. */
  const tickCluster = async (): Promise<void> => {
    if (database.kind !== 'ready') return
    const currentLease = database.lease
    const migration = getMigrationPromise(currentLease.generationId)
    if (!migration) return
    await Promise.race([migration, closed])
    if (!isRunning()) return
    const db = currentLease.database
    await activateEnabledExtensionNitroPlugins(db, app, await getRegisteredExtensions())
    const handlers = getRegisteredQueueHandlers(app).filter(handler => handler.executionScope !== 'process')
      .filter(handler => enabled(handler.queueLevel))
    if (!handlers.length) return
    const enabledKeys = await withoutAccessLogCapture(() => getQueueEnabledExtensionKeys(db))
    if (!isRunning()) return
    await prepareQueueSchedules(db, handlers, levels)
    if (!isRunning()) return
    const context: HostQueueContext = {
      db,
      createWriteAuthorization: createScheduledExtensionWriteAuthorization,
      runForAgency: (agencyId, operation) => withAuditExecution({ type: 'agency', agencyId }, operation)
    }
    for (const handler of handlers) {
      const mayDispatch = () => isRunning() && getRegisteredQueueHandlers(app).includes(handler)
      if (!mayDispatch()) continue
      if (running.has(handler.id) || (handler.extensionKey && !enabledKeys.has(handler.extensionKey))) continue
      const work = runQueueHandler(db, handler, context, mayDispatch)
        .then(() => {})
        .catch(error => console.error(`Queue dispatch failed: ${handler.id}`, error))
        .finally(() => { running.delete(handler.id) })
      running.set(handler.id, work)
    }
  }

  /**
   * Offers every process and cluster queue level through one timer.
   * @returns After dispatching work and scheduling the next polling cycle.
   */
  const poll = (): void => withSystemAudit(() => {
    if (!isRunning()) return
    for (const handler of getRegisteredQueueHandlers(app)) {
      if (!enabled(handler.queueLevel) || handler.executionScope !== 'process' || running.has(handler.id)) continue
      const work = runProcessQueueHandler(handler, app).then(() => {})
        .catch(error => console.error(`Process queue dispatch failed: ${handler.id}`, error))
        .finally(() => { running.delete(handler.id) })
      running.set(handler.id, work)
    }
    if (clusterTick.kind === 'idle') {
      const work = tickCluster().catch(error => console.error('Queue tick failed', error))
        .finally(() => { clusterTick = { kind: 'idle' } })
      clusterTick = { kind: 'running', work }
    }
    const timer = setTimeout(poll, queuePollDelayMs(levels, Date.now()))
    runner = { kind: 'polling', timer }
    timer.unref?.()
  })

  app.hooks.hookOnce('close', async () => {
    if (runner.kind === 'polling') clearTimeout(runner.timer)
    runner = { kind: 'stopping' }
    signalClose()
    try {
      if (clusterTick.kind === 'running') await clusterTick.work
      await Promise.all(running.values())
    } finally {
      const lease = database.kind === 'ready' ? database.lease : null
      database = { kind: 'released' }
      try {
        await lease?.release()
      } finally {
        runner = { kind: 'stopped' }
      }
    }
  })
  // Starting on the next event-loop turn lets startup plugins register first.
  const timer = setTimeout(poll, 0)
  runner = { kind: 'polling', timer }
  timer.unref?.()
})
