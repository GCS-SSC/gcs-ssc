import { acquireDbLease } from '../utils/db'
import { getMigrationPromise } from '../utils/migration-readiness'
import { activateEnabledExtensionNitroPlugins } from '../utils/extension-nitro-plugins'
import { getRegisteredExtensions } from '../utils/extensions'
import { createScheduledExtensionWriteAuthorization } from '../utils/extension-scheduled-import'
import { withAuditExecution } from '../utils/audit-context'
import { createL1QueueRegistration, L1_QUEUE_HOOK, runL1QueueHandler } from '../utils/l1-queue'
import type { GcsL1QueueContext, GcsL1QueueRegistration } from '@gcs-ssc/extensions/server'

export default defineNitroPlugin(async app => {
  const lease = await acquireDbLease()
  const db = lease.database
  const running = new Map<string, Promise<void>>()
  let stopped = false
  let active: Promise<void> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const context: GcsL1QueueContext = {
    db,
    createWriteAuthorization: createScheduledExtensionWriteAuthorization,
    runForAgency: (agencyId, operation) => withAuditExecution({ type: 'agency', agencyId }, operation)
  }

  /** Offers independently leased handlers one bounded run after database readiness. */
  const tick = async (): Promise<void> => {
    const migration = getMigrationPromise(lease.generationId)
    if (!migration) return
    await migration
    if (stopped) return
    await activateEnabledExtensionNitroPlugins(db, app, await getRegisteredExtensions())
    const registration = createL1QueueRegistration()
    await (app.hooks as unknown as {
      callHook: (name: string, registration: GcsL1QueueRegistration) => Promise<void>
    }).callHook(L1_QUEUE_HOOK, registration)
    const enabled = await db.selectFrom('extensions.agency_enablement as enablement')
      .innerJoin('Agency_Profile as agency', 'agency.id', 'enablement.agency_id')
      .select('enablement.extension_key').where('enablement.enabled', '=', true)
      .where('enablement._deleted', '=', false).where('agency._deleted', '=', false).execute()
    const enabledKeys = new Set(enabled.map(row => row.extension_key))
    if (stopped) return
    for (const handler of registration.handlers) {
      if (running.has(handler.id) || (handler.extensionKey && !enabledKeys.has(handler.extensionKey))) continue
      const work = runL1QueueHandler(db, handler, context)
        .then(() => {})
        .catch(error => console.error(`L1 queue dispatch failed: ${handler.id}`, error))
        .finally(() => { running.delete(handler.id) })
      running.set(handler.id, work)
    }
  }

  /** Starts a tick and rearms polling independently of active handlers. */
  const start = (): void => {
    if (stopped) return
    active = tick().catch(error => console.error('L1 queue tick failed', error)).finally(() => {
      if (!stopped) {
        timer = setTimeout(start, 5000)
        timer.unref?.()
      }
    })
  }
  app.hooks.hookOnce('close', async () => {
    stopped = true
    clearTimeout(timer)
    try {
      await active
      await Promise.all(running.values())
    } finally {
      await lease.release()
    }
  })
  // Starting on the next event-loop turn lets all startup plugins register first.
  timer = setTimeout(start, 0)
  timer.unref?.()
})
