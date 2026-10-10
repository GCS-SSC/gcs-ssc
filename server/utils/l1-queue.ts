/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Internal scheduling helpers have explicit typed contracts. */
import { randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import type { GcsL1QueueContext, GcsL1QueueHandler, GcsL1QueueRegistration } from '@gcs-ssc/extensions/server'
import type { Database } from '../../shared/types/database'

export const L1_QUEUE_HOOK = 'gcs-extension:l1-queue-register'
export const L1_QUEUE_LEASE_MS = 120_000
const hostRegistrationKey = Symbol.for('gcs-ssc.l1-host-handlers')

/** Registers host-owned work using the same lifecycle as extension registrations. */
export const registerL1QueueHandler = (
  handler: GcsL1QueueHandler,
  app: { hooks: unknown }
): void => {
  let handlers = Reflect.get(app, hostRegistrationKey) as Map<string, GcsL1QueueHandler> | undefined
  if (!handlers) {
    handlers = new Map()
    Object.defineProperty(app, hostRegistrationKey, { value: handlers })
    const registered = handlers
    const hooks = app.hooks as { hook: (name: string, callback: (registration: GcsL1QueueRegistration) => void) => void }
    hooks.hook(L1_QUEUE_HOOK, registration => {
      for (const current of registered.values()) registration.register(current)
    })
  }
  handlers.set(handler.id, handler)
}

/** Validates one complete collection, including duplicate identities. */
export const createL1QueueRegistration = (): GcsL1QueueRegistration & { handlers: GcsL1QueueHandler[] } => {
  const handlers: GcsL1QueueHandler[] = []
  return {
    handlers,
    /** Rejects invalid handler registrations before any work is claimed. */
    register: handler => {
      if (!/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(handler.id) || handler.id.length > 240) {
        throw new Error(`Invalid L1 queue handler identity: ${handler.id}`)
      }
      if (!Number.isSafeInteger(handler.intervalMs) || handler.intervalMs < 1000 || handler.intervalMs > 2_147_483_647) {
        throw new Error(`Invalid L1 queue interval for ${handler.id}`)
      }
      if (handlers.some(existing => existing.id === handler.id)) throw new Error(`Duplicate L1 queue handler: ${handler.id}`)
      if (handler.extensionKey && !handler.id.startsWith(`${handler.extensionKey}:`)) {
        throw new Error(`L1 queue handler namespace does not match ${handler.extensionKey}`)
      }
      handlers.push(handler)
    }
  }
}

/** Atomically claims a due recurring job; crashed workers leave reclaimable leases. */
export const claimL1QueueHandler = async (db: Kysely<Database>, handlerId: string, owner: string) => {
  await db.insertInto('l1_queue').values({ handler_id: handlerId })
    .onConflict(conflict => conflict.column('handler_id').doNothing()).execute()
  return db.updateTable('l1_queue').set({
    lease_owner: owner,
    lease_expires_at: sql<Date>`now() + ${L1_QUEUE_LEASE_MS} * interval '1 millisecond'`,
    updated_at: sql<Date>`now()`
  }).where('handler_id', '=', handlerId).where('next_run_at', '<=', sql<Date>`now()`)
    .where(eb => eb.or([eb('lease_owner', 'is', null), eb('lease_expires_at', '<=', sql<Date>`now()`)]))
    .returningAll().executeTakeFirst()
}

/** Keeps one lease alive until bounded work completes, then schedules its next run. */
export const runL1QueueHandler = async (
  db: Kysely<Database>, handler: GcsL1QueueHandler, context: GcsL1QueueContext
): Promise<boolean> => {
  const owner = randomUUID()
  const job = await claimL1QueueHandler(db, handler.id, owner)
  if (!job) return false
  let renewal: Promise<unknown> = Promise.resolve()
  const heartbeat = setInterval(() => {
    renewal = renewal.then(() => db.updateTable('l1_queue').set({
      lease_expires_at: sql<Date>`now() + ${L1_QUEUE_LEASE_MS} * interval '1 millisecond'`
    }).where('id', '=', job.id).where('lease_owner', '=', owner).execute())
      .catch(error => console.error(`L1 lease renewal failed for ${handler.id}`, error))
  }, L1_QUEUE_LEASE_MS / 4)
  heartbeat.unref?.()
  let failed = false
  let failure: unknown
  try {
    await handler.run(context)
  } catch (error) {
    failed = true
    failure = error
  } finally {
    clearInterval(heartbeat)
    await renewal
  }
  const attempts = !failed ? 0 : Math.min(job.attempt_count + 1, 2_147_483_647)
  const delay = !failed ? handler.intervalMs : Math.max(handler.intervalMs, Math.min(30_000 * 2 ** Math.min(attempts - 1, 6), 1_800_000))
  await db.updateTable('l1_queue').set({
    next_run_at: sql<Date>`now() + ${delay} * interval '1 millisecond'`,
    attempt_count: attempts,
    lease_owner: null,
    lease_expires_at: null,
    last_error: !failed ? null : (failure instanceof Error ? failure.message : String(failure)).slice(0, 1000),
    updated_at: sql<Date>`now()`
  }).where('id', '=', job.id).where('lease_owner', '=', owner).execute()
  if (failed) console.error(`L1 queue handler failed: ${handler.id}`, failure)
  return true
}
