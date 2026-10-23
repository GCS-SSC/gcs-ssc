/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Internal process execution contracts are explicit. */
import { getQueueLevel, queueCycleAt, queueNextRunAt, queueRetryDelayMs } from '../../shared/utils/queue-levels'

/** Native work whose data belongs to this process rather than a shared cluster claim. */
export type ProcessQueueHandler = {
  id: string
  queueLevel: number
  executionScope: 'process'
  extensionKey?: never
  run: () => Promise<void>
}

type ProcessQueueState = {
  handler: ProcessQueueHandler
  lastCycleAt: Date
  attemptCount: number
  lastError: string | null
  retryNotBefore: Date | null
  nextRunAt: Date
  updatedAt: Date
}

type ProcessQueueRuntime = {
  states: Map<string, ProcessQueueState>
  running: Map<string, Promise<void>>
}

const processRuntimeKey = Symbol.for('gcs-ssc.process-queue-runtime')
/** Retains local execution state with the application across module reloads. */
const runtimeFor = (app: object): ProcessQueueRuntime => {
  const existing = Object.hasOwn(app, processRuntimeKey)
    ? Reflect.get(app, processRuntimeKey) as ProcessQueueRuntime
    : undefined
  if (existing) return existing
  const runtime: ProcessQueueRuntime = { states: new Map(), running: new Map() }
  Object.defineProperty(app, processRuntimeKey, { value: runtime })
  return runtime
}

/** Initializes a local subscription, retaining retry evidence across same-level replacement. */
export const registerProcessQueueState = (handler: ProcessQueueHandler, app: object): void => {
  const definition = getQueueLevel(handler.queueLevel)
  if (!definition) throw new Error(`Invalid queue level for ${handler.id}: ${handler.queueLevel}`)
  const runtime = runtimeFor(app)
  const previous = runtime.states.get(handler.id)
  const now = new Date()
  const lastCycleAt = queueCycleAt(now, definition.cadenceMs)
  runtime.states.set(handler.id, previous?.handler.queueLevel === handler.queueLevel
    ? { ...previous, handler }
    : {
        handler, lastCycleAt, attemptCount: 0, lastError: null, retryNotBefore: null,
        nextRunAt: queueNextRunAt({ cadenceMs: definition.cadenceMs, lastCycleAt, retryNotBefore: null }), updatedAt: now
      })
}

/** Deletes only the owning registration's state; stale lifecycle callbacks cannot remove replacements. */
export const unregisterProcessQueueState = (handler: ProcessQueueHandler, app: object): void => {
  const runtime = runtimeFor(app)
  if (runtime.states.get(handler.id)?.handler === handler) runtime.states.delete(handler.id)
}

/** Reads genuine app-local evidence without creating a shared lease or contacting a database. */
export const readProcessQueueState = (handler: ProcessQueueHandler, app: object) => {
  const runtime = runtimeFor(app)
  const state = runtime.states.get(handler.id)
  if (!state || state.handler !== handler) return null
  return {
    queueLevel: handler.queueLevel,
    executionScope: 'process' as const,
    running: runtime.running.has(handler.id),
    lastCycleAt: state.lastCycleAt.toISOString(),
    leaseCycleAt: null,
    attemptCount: state.attemptCount,
    retryNotBefore: state.retryNotBefore?.toISOString() ?? null,
    nextRunAt: state.nextRunAt.toISOString(),
    leaseOwner: null,
    leaseExpiresAt: null,
    lastError: state.lastError,
    updatedAt: state.updatedAt.toISOString()
  }
}

/** Offers one aligned local cycle without consulting primary database readiness or leases. */
export const runProcessQueueHandler = async (handler: ProcessQueueHandler, app: object): Promise<boolean> => {
  const definition = getQueueLevel(handler.queueLevel)
  if (!definition) throw new Error(`Invalid queue level for ${handler.id}: ${handler.queueLevel}`)
  const runtime = runtimeFor(app)
  const state = runtime.states.get(handler.id)
  if (!state || state.handler !== handler || runtime.running.has(handler.id) || state.nextRunAt.getTime() > Date.now()) return false
  let entered = false
  const work = Promise.resolve().then(async () => {
    if (runtime.states.get(handler.id) !== state) return
    entered = true
    let failed = false
    let failure: unknown
    try {
      await handler.run()
    } catch (error) {
      failed = true
      failure = error
    }
    // Replaced or disposed callbacks must not overwrite the new registration's evidence.
    if (runtime.states.get(handler.id) !== state) return
    const now = new Date()
    state.lastCycleAt = queueCycleAt(now, definition.cadenceMs)
    state.attemptCount = failed ? Math.min(state.attemptCount + 1, 2_147_483_647) : 0
    state.lastError = failed ? (failure instanceof Error ? failure.message : String(failure)).slice(0, 1000) : null
    const delay = failed ? queueRetryDelayMs(definition, state.attemptCount) : 0
    state.retryNotBefore = delay ? new Date(now.getTime() + delay) : null
    state.nextRunAt = queueNextRunAt({
      cadenceMs: definition.cadenceMs, lastCycleAt: state.lastCycleAt, retryNotBefore: state.retryNotBefore
    })
    state.updatedAt = now
    if (failed) console.error({ event: 'queue.process_failed', handlerId: handler.id })
  }).finally(() => { runtime.running.delete(handler.id) })
  runtime.running.set(handler.id, work)
  await work
  return entered
}
