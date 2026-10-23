import { randomUUID } from 'node:crypto'
import type { Kysely, QueryResult, RawBuilder } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AccessEvidence } from './access-log-queue'
import { auditControls } from './audit-runtime'
import { auditScope } from './audit-context'
import { redactAuditSql } from './audit-driver'
import { getAccessLogDatabase } from './access-log-storage'
import { finalizeAuditInputs, prepareAuditInputCandidate } from './audit-statement-metadata'

/**
 * Captures application history reads without instrumenting internal storage maintenance.
 * Identity and inputs are copied before asynchronous destination acquisition. The remote
 * connection is released before evidence enters the business generation's best-effort queue.
 * @param business - Business generation owning request identity and the access queue.
 * @param query - Browser query whose bindings remain unclassified and redacted.
 * @returns Native query results; full result values are never copied into evidence.
 */
export const executeAccessLogRead = async <R>(business: Kysely<Database>, query: RawBuilder<R>): Promise<QueryResult<R>> => {
  const control = auditControls.get(business)
  // Standalone fixtures can use the business store, whose existing driver captures reads.
  if (!control?.enabled || !control.accessDatabase || !control.recordAccess || control.accessEnabled === false || auditScope.getStore()?.bypass) {
    return await query.execute(await getAccessLogDatabase(business))
  }
  const identity = { ...control.identity() }
  const request = control.accessRequest?.()
  const compiled = query.compile(business)
  const event: AccessEvidence = {
    id: randomUUID(), transaction_id: randomUUID(), created_at: new Date().toISOString(),
    actor_user_id: identity.actorUserId, actor_kind: identity.actorKind, request_id: identity.requestId,
    sql: redactAuditSql(compiled.sql).slice(0, 32768),
    parameters: compiled.parameters.slice(0, 1000).map(() => '[REDACTED: unclassified parameter]'),
    inputs: finalizeAuditInputs(prepareAuditInputCandidate(compiled, identity.http)),
    duration_ms: 0, outcome: 'failed', transaction_outcome: 'rolled_back', row_count: null,
    returned_identities: [], limitations: ['parameters_redacted', 'returned_identities_unavailable'],
    table_name: 'audit.access_event', error_code: null, scope_type: 'unresolved', agency_id: null, agency_ids: [],
    attribution_error: 'failed_statement_ownership_unavailable'
  }
  if (compiled.sql.length > 32768) event.limitations.push('sql_truncated')
  if (compiled.parameters.length > 1000) event.limitations.push('parameters_truncated')
  const started = performance.now()
  try {
    const result = await (await getAccessLogDatabase(business)).executeQuery(compiled)
    event.outcome = 'success'
    event.transaction_outcome = 'committed'
    event.row_count = String(result.numAffectedRows ?? result.rows.length)
    event.scope_type = 'global'
    event.attribution_error = null
    return result
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && /^[A-Z0-9]{5}$/.test(String(error.code))) event.error_code = String(error.code)
    throw error
  } finally {
    event.duration_ms = performance.now() - started
    control.recordAccess(event, request)
  }
}
