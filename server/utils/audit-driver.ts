import type { AuditOwnership } from './audit-ownership'
import { instrumentAuditRead, extractAuditRead, isSimpleAuditWrite } from './audit-read-statement'
import { combinedScope, auditWritePredicate } from './audit-query-ownership'
import { isGlobalAuditQuery, type AuditCapturePolicy } from './audit-inputs'
import { finalizeAuditInputs, prepareAuditInputCandidate, type AuditStatementMetadata } from './audit-statement-metadata'
import { createAccessLogQueue, type AccessEvidence, type AccessLogRequest } from './access-log-queue'
import { auditProjection, returnedAuditIdentities } from './audit-projection'
/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Driver methods implement Kysely's documented connection contract. */
import { auditScope } from './audit-context'
import { randomUUID } from 'node:crypto'
import { AliasNode, CompiledQuery, TableNode, type DatabaseConnection, type Dialect, type Driver, type QueryResult } from 'kysely'

export interface AuditIdentity {
  actorUserId: string | null
  actorKind: 'user' | 'anonymous' | 'system'
  requestId: string | null
  protected: boolean
  execution?: import('./audit-context').AuditExecutionScope
  http?: unknown
}
interface Lease {
  raw: DatabaseConnection
  transaction: boolean
  transactionId: string | null
  events: AccessEvidence[]
  access: { released: boolean }
  savepoints: Map<string, number>
  unlock: () => void
}
export interface AuditControl {
  keys?: ReadonlyMap<string, string[]>
  policies?: AuditCapturePolicy
  enabled: boolean
  ownershipRegistry?: Readonly<Record<string, import('../database/audit-ownership-registry').AuditOwnershipRule>>
  ownershipEnabled?: boolean
  accessEnabled?: boolean
  accessRequest?: () => AccessLogRequest | undefined
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
    } else if (statement[offset] === '"') {
      const start = offset++
      while (offset < statement.length) {
        if (statement[offset] === '"' && statement[offset + 1] === '"') offset += 2
        else if (statement[offset++] === '"') break
      }
      result += statement.slice(start, offset)
    } else if (statement[offset] === '\'') {
      const escaped = /(?:^|[^\w$])[eE]$/.test(statement.slice(0, offset))
      offset++
      while (offset < statement.length) {
        if (statement[offset] === '\\' && !escaped) {
          // Ordinary strings depend on standard_conforming_strings. Never guess the
          // connection setting and accidentally retain a following literal.
          return result + '\'[REDACTED SQL TAIL]\''
        }
        if (statement[offset] === '\\' && escaped) offset += 2
        else if (statement[offset] === '\'' && statement[offset + 1] === '\'') offset += 2
        else if (statement[offset++] === '\'') break
      }
      result += '\'[REDACTED]\''
    } else {
      const dollar = /^\$(?:[a-z_\u0080-\uffff][a-z_0-9\u0080-\uffff]*)?\$/i.exec(remaining)?.[0]
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

/** Retain a single physical target for diagnostics without resolving its current owner. */
const statementTable = (query: CompiledQuery): string | null => {
  const root = query.query
  if (root.kind === 'SelectQueryNode' && (root.with || root.setOperations || root.joins?.length)) return null
  if (root.kind === 'UpdateQueryNode' && (root.with || root.from || root.joins?.length)) return null
  if (root.kind === 'DeleteQueryNode' && (root.with || root.using || root.joins?.length)) return null
  if (root.kind === 'InsertQueryNode' && root.with) return null
  const sources = root.kind === 'SelectQueryNode' || root.kind === 'DeleteQueryNode'
    ? root.from?.froms
    : root.kind === 'InsertQueryNode'
      ? root.into ? [root.into] : []
      : root.kind === 'UpdateQueryNode' ? [root.table] : []
  if (sources?.length !== 1 || !sources[0]) return null
  const table = AliasNode.is(sources[0]) ? sources[0].node : sources[0]
  return TableNode.is(table) ? `${table.table.schema?.name ?? 'public'}.${table.table.identifier.name}` : null
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
    const queue = createAccessLogQueue(async events => {
      const connection = await rawLease()
      try {
        await connection.raw.executeQuery(CompiledQuery.raw(`INSERT INTO audit.access_event
          SELECT * FROM jsonb_populate_recordset(NULL::audit.access_event, $1::jsonb)
          ON CONFLICT (id) DO NOTHING`, [JSON.stringify(events)]))
      } finally {
        try {
          await driver.releaseConnection(connection.raw)
        } finally {
          connection.unlock()
        }
      }
    }, control.report)
    control.flush = () => queue.flush()
    const state = (connection: DatabaseConnection): Lease => {
      const value = leases.get(connection)
      if (!value) throw new Error('Unknown audit connection lease')
      return value
    }
    const finish = (lease: Lease, outcome: string) => {
      for (const event of lease.events) if (event.transaction_outcome === 'pending') event.transaction_outcome = outcome
      lease.transaction = false
      lease.transactionId = null
      lease.savepoints.clear()
    }
    const wrapper: Driver = {
      init: () => driver.init(),
      acquireConnection: async () => {
        const { raw, unlock } = await rawLease()
        const lease: Lease = { raw, unlock, transaction: false, transactionId: null, events: [], access: { released: false }, savepoints: new Map() }
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
            const execution = Object.freeze(isGlobalAuditQuery(query)
              ? { type: 'global' as const }
              : { ...(auditScope.getStore()?.execution ?? identity.execution ?? { type: 'global' as const }) })
            const creationOwner = auditScope.getStore()?.creationOwner
            const inputCandidate = prepareAuditInputCandidate(query, identity.http)
            const failedInputs = finalizeAuditInputs(inputCandidate)
            const transactionId = lease.transactionId ?? randomUUID()
            const request = control.accessRequest?.()
            const queryId = randomUUID()
            const previous = queryTail
            let next = () => {}
            queryTail = new Promise<void>(resolve => {
              next = resolve
            })
            await previous
            const event: AccessEvidence | undefined = control.accessEnabled === false
              ? undefined
              : {
                  id: queryId, created_at: new Date().toISOString(), actor_user_id: identity.actorUserId,
                  actor_kind: identity.actorKind, request_id: identity.requestId, sql: redactAuditSql(query.sql).slice(0, 32768),
                  parameters: query.parameters.slice(0, 1000).map(() => '[REDACTED: unclassified parameter]'), duration_ms: 0,
                  outcome: 'failed', transaction_outcome: 'pending', row_count: null,
                  returned_identities: [], limitations: ['parameters_redacted', 'returned_identities_unavailable'],
                  table_name: null, error_code: null,
                  scope_type: execution.type === 'transfer' ? 'global' : execution.type, agency_id: execution.type === 'agency' ? execution.agencyId : null,
                  agency_ids: execution.type === 'agency' ? [execution.agencyId] : [],
                  transaction_id: transactionId, inputs: failedInputs
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
              const readStatement = control.ownershipEnabled && event
                ? instrumentAuditRead(query, identity.actorUserId, queryId)
                : undefined
              // Only the business statement can prove ownership. A preflight lookup
              // has an earlier snapshot and is superseded on success and failure.
              const scopeName = control.ownershipEnabled ? 'unresolved' : execution.type === 'transfer' ? 'global' : execution.type
              const audience = !control.ownershipEnabled && execution.type === 'agency' ? [execution.agencyId] : []
              if (event && control.ownershipEnabled) {
                event.scope_type = scopeName
                event.agency_id = audience[0] ?? null
                event.agency_ids = audience
                event.attribution_error = 'statement_ownership_unavailable'
                event.table_name = statementTable(query)
              }
              const simpleWrite = event && control.ownershipEnabled && isSimpleAuditWrite(query)
              const writePredicate = simpleWrite ? auditWritePredicate(query) : null
              await raw.executeQuery(CompiledQuery.raw(`SELECT set_config('app.audit_actor_user_id', $1, true),
                set_config('app.audit_request_id', $2, true), set_config('app.audit_actor_kind', $3, true),
                set_config('app.audit_query_id', $4, true),
                set_config('app.audit_scope', $5, true), set_config('app.audit_agency_id', $6, true),
                set_config('app.audit_transaction_id', $7, true), set_config('app.audit_inputs', $8, true),
                set_config('app.audit_transfer', $9, true), set_config('app.audit_creation_owner', $10, true),
                set_config('app.audit_agency_ids', ARRAY(SELECT jsonb_array_elements_text($11::jsonb))::text, true),
                set_config('app.audit_actor_agencies', $12, true),
                set_config('app.audit_statement_audience', '', true),
                set_config('app.audit_capture_access_ownership', $13, true),
                set_config('app.audit_input_candidate', $14, true),
                set_config('app.audit_statement_metadata', $15, true),
                set_config('app.audit_write_predicate', $16, true),
                set_config('app.audit_write_predicate_scopes', '', true)`,
              [identity.actorUserId ?? '', identity.requestId ?? '', identity.actorKind, queryId, scopeName,
                audience[0] ?? '', transactionId, JSON.stringify(failedInputs), execution.type === 'transfer' ? JSON.stringify(execution) : '', creationOwner ? JSON.stringify(creationOwner) : '', JSON.stringify(audience),
                '', event && control.ownershipEnabled ? 'on' : 'off', JSON.stringify(inputCandidate), '',
                JSON.stringify(writePredicate)]))
              let result = await raw.executeQuery<R>(readStatement?.query ?? query)
              let currentMetadata: AuditStatementMetadata | null = null
              let statementOwnership = false
              if (readStatement && event) {
                statementOwnership = true
                const captured = extractAuditRead(result.rows, readStatement.field)
                result = { ...result, rows: captured.rows }
                currentMetadata = captured.metadata
                event.inputs = finalizeAuditInputs(inputCandidate, captured.metadata)
                const resolved = combinedScope(captured.scopes)
                event.scope_type = resolved.type
                event.agency_ids = resolved.type === 'agency' ? resolved.agencyIds : []
                event.agency_id = event.agency_ids[0] ?? null
                event.attribution_error = resolved.type === 'unresolved' ? resolved.reason : null
              }
              if (event && !readStatement && control.ownershipEnabled !== true && inputCandidate.table) {
                const exclusions = control.policies?.get(inputCandidate.table)
                currentMetadata = { table: inputCandidate.table, excludedColumns: exclusions ? [...exclusions] : null,
                  primaryKey: [...(control.keys?.get(inputCandidate.table) ?? [])] }
                event.inputs = finalizeAuditInputs(inputCandidate, currentMetadata)
              }
              if (event && simpleWrite) {
                statementOwnership = true
                const captured = await raw.executeQuery<{ audience: {
                  scope?: AuditOwnership; attemptedScope?: AuditOwnership; attempts?: number; inserted?: number
                } | null; predicate_scopes: AuditOwnership[] | null; metadata: AuditStatementMetadata | null; inputs: AccessEvidence['inputs'] }>(CompiledQuery.raw(`SELECT
                  nullif(current_setting('app.audit_statement_audience',true),'')::jsonb AS audience,
                  nullif(current_setting('app.audit_statement_metadata',true),'')::jsonb AS metadata,
                  nullif(current_setting('app.audit_inputs',true),'')::jsonb AS inputs,
                  nullif(current_setting('app.audit_write_predicate_scopes',true),'')::jsonb AS predicate_scopes`))
                const statement = captured.rows[0]?.audience
                const statementMetadata = captured.rows[0]?.metadata
                if (statementMetadata?.queryId === queryId && statementMetadata.table === inputCandidate.table) {
                  currentMetadata = statementMetadata
                  if (captured.rows[0]?.inputs) event.inputs = captured.rows[0]!.inputs
                }
                const scopes: AuditOwnership[] = statement?.scope ? [statement.scope] : []
                if ((statement?.attempts ?? 0) > (statement?.inserted ?? 0) && statement?.attemptedScope) {
                  scopes.push(statement.attemptedScope)
                }
                if (!scopes.length && statementMetadata?.queryId === queryId && statementMetadata.table === writePredicate?.table) {
                  scopes.push(...(captured.rows[0]?.predicate_scopes ?? []))
                }
                const resolved = scopes.length
                  ? combinedScope(scopes)
                  : { type: 'unresolved' as const, reason: 'statement_matched_no_owned_rows' }
                event.scope_type = resolved.type
                event.agency_ids = resolved.type === 'agency' ? resolved.agencyIds : []
                event.agency_id = event.agency_ids[0] ?? null
                event.attribution_error = resolved.type === 'unresolved' ? resolved.reason : null
              }
              if (event) {
                if (control.ownershipEnabled && !statementOwnership) {
                  event.scope_type = 'unresolved'
                  event.agency_id = null
                  event.agency_ids = []
                  event.attribution_error = 'statement_ownership_unavailable'
                }
                if (!currentMetadata && !readStatement) {
                  const stored = (await raw.executeQuery<{ metadata: AuditStatementMetadata | null }>(CompiledQuery.raw(
                    `SELECT nullif(current_setting('app.audit_statement_metadata',true),'')::jsonb AS metadata`))).rows[0]?.metadata
                  currentMetadata = stored?.queryId === queryId && stored.table === inputCandidate.table ? stored : null
                }
                const keys = currentMetadata?.table && currentMetadata.primaryKey ? new Map([[currentMetadata.table, currentMetadata.primaryKey]]) : new Map()
                const projection = auditProjection(query, keys)
                event.table_name = projection?.table ?? event.table_name
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
              }
              if (standalone) {
                await driver.commitTransaction(raw)
                if (event) event.transaction_outcome = 'committed'
              }
              return result
            } catch (error) {
              if (event) {
                event.error_code = errorCode(error)
                event.inputs = failedInputs
                if (control.ownershipEnabled) {
                  event.scope_type = 'unresolved'
                  event.agency_id = null
                  event.agency_ids = []
                  event.attribution_error = 'failed_statement_ownership_unavailable'
                }
              }
              if (standalone) {
                if (event) event.transaction_outcome = 'rolled_back'
                if (began) await driver.rollbackTransaction(raw)
              }
              throw error
            } finally {
              next()
              if (event) {
                event.duration_ms = performance.now() - started
                const access = lease.access
                if (queue.add(event, () => access.released && (!request || request.complete))) lease.events.push(event)
              }
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
        lease.transactionId = randomUUID()
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
          lease.access.released = true
        }
      },
      destroy: async () => {
        await control.stop?.()
        await queue.shutdown()
        await driver.destroy()
      }
    }
    return wrapper
  }
})
