import nodeProcess from 'node:process'

export const STARTUP_TIMEOUT_MS = 120_000

const transientCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN', '57P03', '57P01', '08000', '08001', '08003', '08006'])

/**
 * Recognizes connection failures without treating schema or credential errors as sleep.
 * @param error - Driver error, possibly a Node aggregate connection error.
 * @returns Whether another startup attempt can recover from the failure.
 */
export const isTransientStartupError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  if ('errors' in error && Array.isArray(error.errors)) {
    return error.errors.length > 0 && error.errors.every(isTransientStartupError)
  }
  if ('code' in error && typeof error.code === 'string') return transientCodes.has(error.code)
  // pg-pool connection acquisition deadlines have no SQLSTATE or network code.
  return error instanceof Error && ['Connection terminated unexpectedly', 'Connection terminated due to connection timeout', 'timeout exceeded when trying to connect'].includes(error.message)
}

/**
 * Retries one serialized startup operation and supervises even a stalled attempt.
 * Production exits on failure because Nitro can otherwise keep serving after a rejected plugin.
 * The watchdog never starts overlapping attempts or abandons database work via Promise.race.
 * @param initialize - Migration and audit initialization operation.
 * @param onFailure - Marks the owning database generation unavailable before termination.
 */
export const recoverStartup = async (initialize: () => Promise<void>, onFailure: () => void): Promise<void> => {
  const deadline = performance.now() + STARTUP_TIMEOUT_MS
  const timeoutError = new Error('Database and audit startup exceeded the two-minute deadline')
  let failed = false
  let expired = false
  /** Marks startup unavailable once, then lets the production supervisor restart it. */
  const fail = () => {
    if (failed) return
    failed = true
    onFailure()
    console.error({ event: 'startup.failed', reason: expired ? 'deadline_exceeded' : 'initialization_error' })
    if (nodeProcess.env.NODE_ENV === 'production') nodeProcess.exit(1)
  }
  const watchdog = setTimeout(() => {
    expired = true
    fail()
  }, STARTUP_TIMEOUT_MS)
  let attempt = 0
  try {
    while (true) {
      if (expired || performance.now() >= deadline) {
        expired = true
        throw timeoutError
      }
      try {
        await initialize()
        if (expired || performance.now() >= deadline) {
          expired = true
          throw timeoutError
        }
        console.info({ event: 'startup.ready', attempts: attempt + 1 })
        return
      } catch (error) {
        if (expired || !isTransientStartupError(error)) throw error
        const delayMs = Math.min(1000 * 2 ** Math.min(attempt++, 3), 5000, Math.max(0, deadline - performance.now()))
        console.warn({ event: 'startup.retry', attempt, delayMs, reason: 'database_unavailable_possible_sleep' })
        await new Promise<void>(resolve => setTimeout(resolve, delayMs))
      }
    }
  } catch (error) {
    fail()
    throw error
  } finally {
    clearTimeout(watchdog)
  }
}
