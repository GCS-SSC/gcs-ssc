/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Internal registry helpers have explicit typed contracts. */
import { AsyncLocalStorage } from 'node:async_hooks'
import { sql, type Kysely } from 'kysely'
import { installGcsQueueRegistrar, type GcsQueueContext, type GcsQueueHandler } from '@gcs-ssc/extensions/server'
import type { GcsRegisteredExtension } from '../../shared/utils/extensions'
import type { Database } from '../../shared/types/database'
import type { QueueSnapshot } from '../../shared/types/queues'
import { getQueueLevel, QUEUE_LEVELS } from '../../shared/utils/queue-levels'
import {
  readProcessQueueState, registerProcessQueueState, unregisterProcessQueueState, type ProcessQueueHandler
} from './queue-process'

export type HostQueueContext = Omit<GcsQueueContext, 'db'> & { db: Kysely<Database> }
export type ClusterQueueHandler = Omit<GcsQueueHandler, 'run'> & {
  executionScope?: 'cluster'
  run: (context: HostQueueContext) => Promise<void>
}
export type RegisteredQueueHandler = ClusterQueueHandler | ProcessQueueHandler

const registryKey = Symbol.for('gcs-ssc.queue-registry')

type QueueActivation = { owner: string; status: 'pending' | 'ready' | 'failed' }

type QueueRegistry = {
  handlers: Map<string, RegisteredQueueHandler>
  pending: Map<string, Map<string, ClusterQueueHandler>>
  extensionKeys: Set<string>
  activationScope: AsyncLocalStorage<QueueActivation>
  registerHost: (handler: RegisteredQueueHandler) => () => void
}

/** Validates and snapshots subscriptions at the registration boundary. */
const validateHandler = (handler: RegisteredQueueHandler): RegisteredQueueHandler => {
  if (!/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(handler.id) || handler.id.length > 240) {
    throw new Error(`Invalid queue handler identity: ${handler.id}`)
  }
  if (!Number.isSafeInteger(handler.queueLevel) || !getQueueLevel(handler.queueLevel)) {
    throw new Error(`Invalid queue level for ${handler.id}: ${handler.queueLevel}`)
  }
  if ('intervalMs' in handler) throw new Error(`Queue handlers select a queue level, not an interval: ${handler.id}`)
  if (typeof handler.run !== 'function') throw new Error(`Invalid queue callback for ${handler.id}`)
  if ('executionScope' in handler && handler.executionScope !== 'cluster' && handler.executionScope !== 'process') {
    throw new Error(`Invalid queue execution scope for ${handler.id}`)
  }
  if (handler.extensionKey && !handler.id.startsWith(`${handler.extensionKey}:`)) {
    throw new Error(`Queue handler namespace does not match ${handler.extensionKey}`)
  }
  return Object.freeze({ ...handler })
}

/** Retains one registry on the application, independent of module reloads or other apps. */
const registryFor = (app: object): QueueRegistry => {
  const existing = Object.hasOwn(app, registryKey) ? Reflect.get(app, registryKey) as QueueRegistry : undefined
  if (existing) return existing
  const handlers = new Map<string, RegisteredQueueHandler>()
  const pending = new Map<string, Map<string, ClusterQueueHandler>>()
  const extensionKeys = new Set<string>()
  const activationScope = new AsyncLocalStorage<QueueActivation>()
  const registry: QueueRegistry = {
    handlers, pending, extensionKeys, activationScope,
    /** Replaces only native callbacks when their owning host plugin reloads. */
    registerHost: handler => {
      const validated = validateHandler(handler)
      if (validated.extensionKey || !validated.id.startsWith('host:')) {
        throw new Error(`Host queue handlers require the host namespace: ${validated.id}`)
      }
      const previous = handlers.get(validated.id)
      if (previous?.executionScope === 'process' && validated.executionScope !== 'process') {
        unregisterProcessQueueState(previous, app)
      }
      handlers.set(validated.id, validated)
      if (validated.executionScope === 'process') registerProcessQueueState(validated, app)
      return () => {
        if (handlers.get(validated.id) !== validated) return
        handlers.delete(validated.id)
        if (validated.executionScope === 'process') unregisterProcessQueueState(validated, app)
      }
    }
  }
  installGcsQueueRegistrar(app, {
    /** Publishes validated extension work or stages it during plugin activation. */
    register: handler => {
      const validated = validateHandler(handler)
      if ('executionScope' in validated && validated.executionScope !== 'cluster') {
        throw new Error('Extension queue handlers require cluster execution')
      }
      if (validated.extensionKey === 'host') throw new Error('Queue extension cannot use the reserved host namespace')
      if (!validated.extensionKey || !extensionKeys.has(validated.extensionKey)) {
        throw new Error(`Queue extension must declare background-queue: ${validated.extensionKey ?? validated.id}`)
      }
      const activation = activationScope.getStore()
      if (activation && activation.owner !== validated.extensionKey) {
        throw new Error(`Queue handler owner does not match activating extension: ${activation.owner}`)
      }
      if (activation?.status === 'failed') {
        throw new Error(`Queue registration belongs to a failed plugin activation: ${activation.owner}`)
      }
      const staged = pending.get(validated.extensionKey)
      if (handlers.has(validated.id) || staged?.has(validated.id)) {
        throw new Error(`Duplicate queue handler: ${validated.id}`)
      }
      const destination = staged ?? handlers
      destination.set(validated.id, validated)
    }
  })
  Object.defineProperty(app, registryKey, { value: registry })
  return registry
}

/** Installs the host service before startup plugins and declares supported extension owners. */
export const initializeQueueRegistry = (
  app: object, extensions: Pick<GcsRegisteredExtension, 'key' | 'requiredHostCapabilities'>[]
): void => {
  const registry = registryFor(app)
  for (const extension of extensions) {
    if (extension.requiredHostCapabilities.includes('background-queue')) registry.extensionKeys.add(extension.key)
  }
}

/** Registers native work immediately; reloading a host plugin replaces its own callback. */
export const registerQueueHandler = (handler: RegisteredQueueHandler, app: object): (() => void) =>
  registryFor(app).registerHost(handler)

/** Reads retained registrations without calling plugins or registration hooks. */
export const getRegisteredQueueHandlers = (app: object): RegisteredQueueHandler[] => {
  const registry = Object.hasOwn(app, registryKey) ? Reflect.get(app, registryKey) as QueueRegistry : undefined
  return registry ? [...registry.handlers.values()] : []
}

/** Commits a newly activated plugin's registrations only after its entire startup succeeds. */
export const activateExtensionQueueHandlers = async (
  app: object, extensionKey: string, activate: () => Promise<void>
): Promise<void> => {
  const registry = registryFor(app)
  const staged = new Map<string, ClusterQueueHandler>()
  if (registry.pending.has(extensionKey)) throw new Error(`Queue activation already pending: ${extensionKey}`)
  registry.pending.set(extensionKey, staged)
  const activation: QueueActivation = { owner: extensionKey, status: 'pending' }
  try {
    await registry.activationScope.run(activation, activate)
    for (const [id, handler] of staged) registry.handlers.set(id, handler)
    activation.status = 'ready'
  } finally {
    if (activation.status === 'pending') activation.status = 'failed'
    registry.pending.delete(extensionKey)
  }
}

/** Resolves the active-Agency execution gate shared by the runner and read model. */
export const getQueueEnabledExtensionKeys = async (db: Kysely<Database>): Promise<Set<string>> => {
  const enabled = await db.selectFrom('extensions.agency_enablement as enablement')
    .innerJoin('Agency_Profile as agency', 'agency.id', 'enablement.agency_id')
    .select('enablement.extension_key').where('enablement.enabled', '=', true)
    .where('enablement._deleted', '=', false).where('agency._deleted', '=', false).execute()
  return new Set(enabled.map(row => row.extension_key))
}

/** Projects every catalog level and retained handler without changing runtime state. */
export const readQueueSnapshot = async (db: Kysely<Database>, app: object): Promise<QueueSnapshot> => {
  const handlers = getRegisteredQueueHandlers(app)
  const [enabledKeys, schedules, executions, clock] = await Promise.all([
    getQueueEnabledExtensionKeys(db),
    db.selectFrom('background_queue_schedule').selectAll().execute(),
    db.selectFrom('background_queue_handler').selectAll().execute(),
    db.selectNoFrom(sql<Date>`statement_timestamp()`.as('observed_at')).executeTakeFirstOrThrow()
  ])
  const registrations = new Map(handlers.map(handler => [handler.id, handler]))
  const rows = new Map(executions.map(row => [row.handler_id, row]))
  const levels = new Map(schedules.map(row => [row.queue_level, row]))
  const ids = new Set([...registrations.keys(), ...rows.keys()])
  return {
    observedAt: new Date(clock.observed_at).toISOString(),
    levels: QUEUE_LEVELS.map(definition => {
      const row = levels.get(definition.level)
      return {
        level: definition.level,
        cadenceMs: definition.cadenceMs,
        retry: definition.retry,
        schedule: row
          ? {
              currentCycleAt: row.current_cycle_at ? new Date(row.current_cycle_at).toISOString() : null,
              nextRunAt: new Date(row.next_run_at).toISOString(),
              updatedAt: new Date(row.updated_at).toISOString()
            }
          : null
      }
    }),
    handlers: [...ids].sort().map(id => {
      const handler = registrations.get(id)
      const row = rows.get(id)
      const level = row ? levels.get(row.queue_level) : undefined
      const definition = row ? getQueueLevel(row.queue_level) : undefined
      const nextRunAt = row
        ? new Date(Math.max(
            new Date(level?.next_run_at ?? clock.observed_at).getTime(),
            row.last_cycle_at && definition ? new Date(row.last_cycle_at).getTime() + definition.cadenceMs : 0,
            row.retry_not_before
              ? definition
                ? Math.ceil(new Date(row.retry_not_before).getTime() / definition.cadenceMs) * definition.cadenceMs
                : new Date(row.retry_not_before).getTime()
              : 0
          )).toISOString()
        : new Date(clock.observed_at).toISOString()
      return {
        id,
        registration: handler
          ? {
              owner: handler.extensionKey ?? 'host',
              queueLevel: handler.queueLevel,
              executionScope: handler.executionScope ?? 'cluster',
              eligible: !handler.extensionKey || enabledKeys.has(handler.extensionKey)
            }
          : null,
        schedule: handler?.executionScope === 'process'
          ? readProcessQueueState(handler, app)
          : row
            ? {
                queueLevel: row.queue_level,
                executionScope: 'cluster',
                running: Boolean(row.lease_owner && row.lease_expires_at && new Date(row.lease_expires_at) > new Date(clock.observed_at)),
                retryNotBefore: row.retry_not_before ? new Date(row.retry_not_before).toISOString() : null,
                nextRunAt,
                lastCycleAt: row.last_cycle_at ? new Date(row.last_cycle_at).toISOString() : null,
                leaseCycleAt: row.lease_cycle_at ? new Date(row.lease_cycle_at).toISOString() : null,
                attemptCount: row.attempt_count,
                leaseOwner: row.lease_owner ?? null,
                leaseExpiresAt: row.lease_expires_at ? new Date(row.lease_expires_at).toISOString() : null,
                lastError: row.last_error ?? null,
                updatedAt: new Date(row.updated_at).toISOString()
              }
            : null
      }
    })
  }
}
