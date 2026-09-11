import { auditProjection, returnedAuditIdentities } from './audit-projection'
/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Driver methods implement Kysely's documented connection contract. */
import { auditScope } from './audit-context'
import { randomUUID } from 'node:crypto'
import { CompiledQuery, type DatabaseConnection, type Dialect, type Driver, type QueryResult } from 'kysely'

export interface AuditIdentity {
  actorUserId: string | null
  actorKind: 'user' | 'anonymous' | 'system'
  requestId: string | null
  protected: boolean
}
interface AccessEvidence {
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
}
interface Lease {
  raw: DatabaseConnection
  transaction: boolean
  events: AccessEvidence[]
  savepoints: Map<string, number>
  unlock: () => void
}
export interface AuditControl {
  keys?: ReadonlyMap<string, string[]>
  enabled: boolean
  identity: () => AuditIdentity
  report: (event: Record<string, unknown>) => void
  stop?: () => Promise<void>
  flush?: () => Promise<void>
}

/** SQL literals are never retained: raw SQL can contain credentials without parameters. */
export const redactAuditSql = (statement: string): string => {
  let result = ''
  let offset = 0
  while (offset < statement.length) {
    const remaining = statement.slice(offset)
    if (remaining.startsWith('--')) {
      const end = statement.indexOf('\n', offset)
      offset = end < 0 ? statement.length : end
      result += ' '
    } else if (remaining.startsWith('/*')) {
      let depth = 1
      offset += 2
      while (offset < statement.length && depth > 0) {
        if (statement.startsWith('/*', offset)) {
          depth++
          offset += 2
        } else if (statement.startsWith('*/', offset)) {
          depth--
          offset += 2
        } else offset++
      }
      result += ' '
    } else if (statement[offset] === '\'') {
      offset++
      while (offset < statement.length) {
        if (statement[offset] === '\\') offset += 2
        else if (statement[offset] === '\'' && statement[offset + 1] === '\'') offset += 2
        else if (statement[offset++] === '\'') break
      }
      result += '\'[REDACTED]\''
    } else {
      const dollar = /^\$(?:[a-z_][a-z_0-9]*)?\$/i.exec(remaining)?.[0]
      if (dollar) {
        const end = statement.indexOf(dollar, offset + dollar.length)
        offset = end < 0 ? statement.length : end + dollar.length
        result += '\'[REDACTED]\''
      } else result += statement[offset++]
    }
  }
  return result.replace(/(?<![$\w])\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi, '[NUMBER]')
}

/** Conservatively classify raw SQL and function calls as potentially mutating. */
export const isKnownAuditRead = (query: CompiledQuery): boolean => query.query.kind === 'SelectQueryNode'
  && !/\b(insert|update|delete|merge|for\s+(update|share)|[a-z_][a-z_0-9]*\s*\()/i.test(query.sql)

const errorCode = (error: unknown): string | null => {
  if (typeof error === 'object' && error !== null && 'code' in error && /^[A-Z0-9]{5}$/.test(String(error.code))) return String(error.code)
  return null
}

/** Wraps either dialect while keeping a complete PGlite lease exclusive. */
export const createAuditDialect = (dialect: Dialect, serialize: boolean, control: AuditControl): Dialect => ({
  createAdapter: () => dialect.createAdapter(),
  createIntrospector: db => dialect.createIntrospector(db),
  createQueryCompiler: () => dialect.createQueryCompiler(),
  createDriver: () => {
    const driver = dialect.createDriver()
    const leases = new WeakMap<DatabaseConnection, Lease>()
    let tail = Promise.resolve()
    let pending: Array<{ event: AccessEvidence; attempts: number }> = []
    let flushing: Promise<void> | undefined
    const limit = 2000
    const lock = async (): Promise<() => void> => {
      if (!serialize) return () => {}
      const previous = tail
      let unlock = () => {}
      tail = new Promise<void>(resolve => {
        unlock = resolve
      })
      await previous
      return unlock
    }
    const rawLease = async () => {
      const unlock = await lock()
      try {
        return { raw: await driver.acquireConnection(), unlock }
      } catch (error) {
        unlock()
        throw error
      }
    }
    const persist = async () => {
      if (pending.length === 0) return
      const batch = pending
      pending = []
      let connection: Awaited<ReturnType<typeof rawLease>> | undefined
      try {
        connection = await rawLease()
        for (const item of batch) {
          await connection.raw.executeQuery(CompiledQuery.raw(`INSERT INTO audit.access_event
            SELECT * FROM jsonb_populate_record(NULL::audit.access_event, $1::jsonb) ON CONFLICT (id) DO NOTHING`, [JSON.stringify(item.event)]))
        }
      } catch (error) {
        control.report({ event: 'audit.access_persistence_failed', code: errorCode(error), backlog: batch.length })
        for (const item of batch) {
          if (++item.attempts >= 3 || pending.length >= limit) control.report({ event: 'audit.access_dropped', id: item.event.id, attempts: item.attempts })
          else pending.push(item)
        }
      } finally {
        if (connection) {
          try {
            await driver.releaseConnection(connection.raw)
          } finally {
            connection.unlock()
          }
        }
      }
    }
    const flush = async (): Promise<void> => {
      if (flushing) return await flushing
      flushing = persist().catch(error => {
        control.report({ event: 'audit.access_flush_failed', code: errorCode(error) })
      }).finally(() => {
        flushing = undefined
      })
      await flushing
    }
    control.flush = flush
    const add = (events: AccessEvidence[]) => {
      for (const event of events) {
        if (pending.length >= limit) control.report({ event: 'audit.access_dropped', id: event.id, reason: 'queue_full' })
        else pending.push({ event, attempts: 0 })
      }
    }
    const state = (connection: DatabaseConnection): Lease => {
      const value = leases.get(connection)
      if (!value) throw new Error('Unknown audit connection lease')
      return value
    }
    const finish = (lease: Lease, outcome: string) => {
      for (const event of lease.events) if (event.transaction_outcome === 'pending') event.transaction_outcome = outcome
      lease.transaction = false
      lease.savepoints.clear()
    }
    const wrapper: Driver = {
      init: () => driver.init(),
      acquireConnection: async () => {
        const { raw, unlock } = await rawLease()
        const lease: Lease = { raw, unlock, transaction: false, events: [], savepoints: new Map() }
        let queryTail = Promise.resolve()
        const connection: DatabaseConnection = {
          executeQuery: async <R>(query: CompiledQuery): Promise<QueryResult<R>> => {
            if (!control.enabled) {
              if (lease.transaction) return await raw.executeQuery<R>(query)
              await driver.beginTransaction(raw, {})
              try {
                await raw.executeQuery(CompiledQuery.raw('SELECT set_config(\'app.audit_bootstrap\', \'on\', true)'))
                const result = await raw.executeQuery<R>(query)
                await driver.commitTransaction(raw)
                return result
              } catch (error) {
                await driver.rollbackTransaction(raw)
                throw error
              }
            }
            if (auditScope.getStore()?.bypass) return await raw.executeQuery<R>(query)
            const identity = Object.freeze({ ...control.identity() })
            const previous = queryTail
            let next = () => {}
            queryTail = new Promise<void>(resolve => {
              next = resolve
            })
            await previous
            const event: AccessEvidence = {
              id: randomUUID(), created_at: new Date().toISOString(), actor_user_id: identity.actorUserId,
              actor_kind: identity.actorKind, request_id: identity.requestId, sql: redactAuditSql(query.sql).slice(0, 32768),
              parameters: query.parameters.slice(0, 1000).map(() => '[REDACTED: unclassified parameter]'), duration_ms: 0,
              outcome: 'failed', transaction_outcome: 'pending', row_count: null,
              returned_identities: [], limitations: ['parameters_redacted', 'returned_identities_unavailable'],
              table_name: null, error_code: null
            }
            const started = performance.now()
            const standalone = !lease.transaction
            let began = false
            try {
              if (/^\s*(begin|commit|rollback|savepoint|release)\b/i.test(query.sql)) {
                throw new Error('Use Kysely transaction and savepoint APIs for audited connections')
              }
              if (identity.protected && !identity.actorUserId && !isKnownAuditRead(query)) throw new Error('Missing authenticated audit identity')
              // Even SELECT can invoke a mutating function; transaction-local context is always installed.
              if (standalone) {
                await driver.beginTransaction(raw, {})
                began = true
              }
              await raw.executeQuery(CompiledQuery.raw(`SELECT set_config('app.audit_actor_user_id', $1, true),
                set_config('app.audit_request_id', $2, true), set_config('app.audit_actor_kind', $3, true),
                set_config('app.audit_query_id', $4, true)`, [identity.actorUserId ?? '', identity.requestId ?? '', identity.actorKind, event.id]))
              const result = await raw.executeQuery<R>(query)
              const projection = auditProjection(query, control.keys ?? new Map())
              event.table_name = projection?.table ?? null
              const captured = returnedAuditIdentities(result.rows, projection)
              const identities = JSON.stringify(captured).length <= 16384 ? captured : null
              if (identities) {
                event.returned_identities = identities
                event.limitations = ['parameters_redacted']
                if (result.rows.length > 1000) event.limitations.push('returned_identities_truncated')
              }
              if (query.sql.length > 32768) event.limitations.push('sql_truncated')
              if (query.parameters.length > 1000) event.limitations.push('parameters_truncated')
              event.outcome = 'success'
              event.row_count = String(result.numAffectedRows ?? result.rows.length)
              if (standalone) {
                await driver.commitTransaction(raw)
                event.transaction_outcome = 'committed'
              }
              return result
            } catch (error) {
              event.error_code = errorCode(error)
              if (standalone) {
                event.transaction_outcome = 'rolled_back'
                if (began) await driver.rollbackTransaction(raw)
              }
              throw error
            } finally {
              next()
              event.duration_ms = performance.now() - started
              if (lease.events.length < limit) lease.events.push(event)
              else control.report({ event: 'audit.access_dropped', id: event.id, reason: 'transaction_buffer_full' })
            }
          },
          streamQuery: async function* <R>(query: CompiledQuery) {
            // Materialize via the same audited path: no cursor may outlive its exclusive lease.
            yield await connection.executeQuery<R>(query)
          }
        }
        leases.set(connection, lease)
        return connection
      },
      beginTransaction: async (connection, settings) => {
        const lease = state(connection)
        if (serialize) {
          const isolation = settings.isolationLevel ? ` ISOLATION LEVEL ${settings.isolationLevel}` : ''
          const mode = settings.accessMode ? ` ${settings.accessMode}` : ''
          await lease.raw.executeQuery(CompiledQuery.raw(`BEGIN${isolation}${mode}`))
        } else await driver.beginTransaction(lease.raw, settings)
        if (!control.enabled) await lease.raw.executeQuery(CompiledQuery.raw('SELECT set_config(\'app.audit_bootstrap\', \'on\', true)'))
        lease.transaction = true
      },
      commitTransaction: async connection => {
        const lease = state(connection)
        await driver.commitTransaction(lease.raw)
        finish(lease, 'committed')
      },
      rollbackTransaction: async connection => {
        const lease = state(connection)
        await driver.rollbackTransaction(lease.raw)
        finish(lease, 'rolled_back')
      },
      savepoint: async (connection, name, compile) => {
        const lease = state(connection)
        if (driver.savepoint) await driver.savepoint(lease.raw, name, compile)
        else await lease.raw.executeQuery(CompiledQuery.raw(`SAVEPOINT "${name.replaceAll('"', '""')}"`))
        lease.savepoints.set(name, lease.events.length)
      },
      rollbackToSavepoint: async (connection, name, compile) => {
        const lease = state(connection)
        if (driver.rollbackToSavepoint) await driver.rollbackToSavepoint(lease.raw, name, compile)
        else await lease.raw.executeQuery(CompiledQuery.raw(`ROLLBACK TO SAVEPOINT "${name.replaceAll('"', '""')}"`))
        const start = lease.savepoints.get(name)
        if (start !== undefined) for (const event of lease.events.slice(start)) event.transaction_outcome = 'rolled_back_to_savepoint'
      },
      releaseSavepoint: async (connection, name, compile) => {
        const lease = state(connection)
        if (driver.releaseSavepoint) await driver.releaseSavepoint(lease.raw, name, compile)
        else await lease.raw.executeQuery(CompiledQuery.raw(`RELEASE SAVEPOINT "${name.replaceAll('"', '""')}"`))
        lease.savepoints.delete(name)
      },
      releaseConnection: async connection => {
        const lease = state(connection)
        try {
          if (lease.transaction) {
            await driver.rollbackTransaction(lease.raw)
            finish(lease, 'rolled_back')
          }
          await driver.releaseConnection(lease.raw)
        } finally {
          leases.delete(connection)
          lease.unlock()
        }
        add(lease.events)
        void flush()
      },
      destroy: async () => {
        await control.stop?.()
        for (let attempt = 0; attempt < 4; attempt++) await flush()
        await driver.destroy()
      }
    }
    return wrapper
  }
})
