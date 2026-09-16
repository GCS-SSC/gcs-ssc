/* eslint-disable jsdoc/require-jsdoc -- Queue operations have explicit typed inputs; lifecycle contract is documented on the factory. */
export interface AccessEvidence {
  id: string
  created_at: string
  actor_user_id: string | null
  actor_kind: string
  request_id: string | null
  sql: string
  parameters: string[]
  duration_ms: number
  outcome: string
  transaction_outcome: string
  row_count: string | null
  returned_identities: unknown[]
  limitations: string[]
  table_name: string | null
  error_code: string | null
  scope_type?: 'global' | 'agency' | 'unresolved'
  agency_id?: string | null
  agency_ids?: string[]
  attribution_error?: string | null
  transaction_id?: string
  inputs?: unknown
}

export interface AccessLogRequest { complete: boolean }

interface BufferedAccess {
  event: AccessEvidence
  ready: () => boolean
  bytes: number
}

const MAX_EVENTS = 2000
const MAX_BYTES = 32 * 1024 * 1024
const BATCH_SIZE = 100

/**
 * Bounded process-local evidence; entries remain owned until persistence is confirmed.
 * @param persist Persists a batch atomically, with UUID deduplication for uncertain commits.
 * @param report Emits structured operational metrics without evidence payloads.
 * @returns Admission, periodic flush, and shutdown operations for one database generation.
 */
export const createAccessLogQueue = (
  persist: (events: AccessEvidence[]) => Promise<void>,
  report: (event: Record<string, unknown>) => void
) => {
  const pending = new Set<BufferedAccess>()
  let bytes = 0
  let failures = 0
  let nextAttempt = 0
  let flushing: Promise<void> | undefined
  let stopping = false
  let shutdownDeadline = Infinity
  const stats = () => ({ backlog: pending.size, bytes, oldestAgeMs: pending.size
    ? Math.max(0, Date.now() - Date.parse(pending.values().next().value!.event.created_at))
    : 0 })
  const remove = (item: BufferedAccess) => {
    if (pending.delete(item)) bytes -= item.bytes
  }
  const write = async (batch: BufferedAccess[], deadline: number): Promise<boolean> => {
    if (Date.now() >= Math.min(deadline, shutdownDeadline)) return false
    try {
      await persist(batch.map(item => item.event))
      for (const item of batch) remove(item)
      return true
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        && /^[A-Z0-9]{5}$/.test(String(error.code))
        ? String(error.code)
        : null
      // Data/constraint failures must not make otherwise valid evidence a poison batch.
      if (code?.startsWith('22') || code?.startsWith('23')) {
        if (batch.length === 1) {
          remove(batch[0]!)
          report({ event: 'audit.access_dropped', id: batch[0]!.event.id, reason: 'invalid_record', code })
          return true
        }
        const middle = Math.ceil(batch.length / 2)
        return await write(batch.slice(0, middle), deadline) && await write(batch.slice(middle), deadline)
      }
      failures++
      const retryMs = Math.min(300_000, 10_000 * 2 ** Math.min(failures - 1, 5))
      nextAttempt = Date.now() + retryMs
      report({ event: 'audit.access_persistence_failed', code, retryMs, ...stats() })
      return false
    }
  }
  const drain = async (deadline: number) => {
    // Snapshot eligibility: records from active responses/transactions never enter a batch.
    const ready = [...pending].filter(item => item.ready())
    for (let offset = 0; offset < ready.length; offset += BATCH_SIZE) {
      if (!await write(ready.slice(offset, offset + BATCH_SIZE), deadline)) return
      failures = 0
      nextAttempt = 0
    }
    if (ready.length || pending.size) report({ event: 'audit.access_queue', ...stats() })
  }
  const flush = async (force = false, deadline = Infinity): Promise<void> => {
    if (flushing) return await flushing
    if ((!force && (stopping || Date.now() < nextAttempt)) || pending.size === 0) return
    flushing = drain(deadline).finally(() => {
      flushing = undefined
    })
    await flushing
  }
  return {
    add: (event: AccessEvidence, ready: () => boolean): boolean => {
      // Leave room for the eventual transaction outcome string as it settles.
      const size = Buffer.byteLength(JSON.stringify(event), 'utf8') + 128
      if (stopping || pending.size >= MAX_EVENTS || bytes + size > MAX_BYTES) {
        report({ event: 'audit.access_dropped', id: event.id, reason: stopping ? 'shutdown' : 'queue_full', ...stats() })
        return false
      }
      pending.add({ event, ready, bytes: size })
      bytes += size
      return true
    },
    flush: () => flush(),
    shutdown: async () => {
      stopping = true
      // Stop starting new batches after five seconds; an in-flight DB operation must settle
      // before its driver is destroyed (PostgreSQL acquisition/statement timeouts still apply).
      shutdownDeadline = Date.now() + 5000
      await flushing
      await flush(true, shutdownDeadline)
      if (pending.size) report({ event: 'audit.access_dropped', reason: 'shutdown', ...stats() })
      pending.clear()
      bytes = 0
    }
  }
}
