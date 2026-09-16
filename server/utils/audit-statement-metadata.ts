/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Internal statement metadata helpers. */
import type { CompiledQuery } from 'kysely'
import { captureAuditParameters, sanitizeAuditInput } from './audit-inputs'

type Node = { kind?: string; [key: string]: unknown }
const node = (value: unknown): Node | undefined => value && typeof value === 'object' ? value as Node : undefined
const columnName = (value: unknown): string | undefined => {
  const current = node(value)
  if (current?.kind === 'ReferenceNode') return columnName(current.column)
  if (current?.kind === 'ColumnNode') return node(current.column)?.name as string | undefined
}
const suppressHttpForTable = (table: string | null) => {
  const relation = table?.split('.').at(-1)?.toLowerCase() ?? ''
  return ['account', 'session', 'verification'].includes(relation) || /secret|credential/.test(relation)
}

export interface AuditStatementMetadata {
  queryId?: string
  table: string
  excludedColumns: string[] | null
  primaryKey: string[]
}

/** Prepare bounded values and column provenance; the database snapshot decides what may be retained. */
export const prepareAuditInputCandidate = (query: CompiledQuery, http?: unknown) => {
  const tables = new Set<string>()
  const provenance = new Map<unknown, Set<string>>()
  const bind = (value: unknown, column?: string) => {
    if (!column) return
    const previous = provenance.get(value) ?? new Set<string>()
    previous.add(column)
    provenance.set(value, previous)
  }
  const visit = (value: unknown, column?: string): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) return value.forEach(item => visit(item, column))
    const current = value as Node
    if (current.kind === 'TableNode') {
      const table = node(current.table)
      tables.add(`${node(table?.schema)?.name ?? 'public'}.${node(table?.identifier)?.name}`)
    }
    if (current.kind === 'ValueNode') return bind(current.value, column)
    if (current.kind === 'PrimitiveValueListNode') {
      for (const item of current.values as unknown[]) bind(item, column)
      return
    }
    if (current.kind === 'ColumnUpdateNode') return visit(current.value, columnName(current.column))
    if (current.kind === 'BinaryOperationNode') {
      visit(current.leftOperand, columnName(current.rightOperand))
      visit(current.rightOperand, columnName(current.leftOperand))
      return
    }
    if (current.kind === 'InsertQueryNode') {
      const columns = (current.columns as unknown[] | undefined)?.map(columnName) ?? []
      const values = node(current.values)
      if (values?.kind === 'ValuesNode') for (const row of values.values as Node[]) {
        ;(row.values as unknown[]).forEach((item, index) => row.kind === 'PrimitiveValueListNode'
          ? bind(item, columns[index])
          : visit(item, columns[index]))
      }
      Object.entries(current).filter(([key]) => key !== 'values').forEach(([, item]) => visit(item))
      return
    }
    Object.values(current).forEach(item => visit(item, current.kind === 'RawNode' ? undefined : column))
  }
  visit(query.query)
  const table = tables.size === 1 ? [...tables][0]! : null
  const baseline = table ? captureAuditParameters(query, new Map([[table, []]])) : query.parameters.map(() => '[REDACTED]')
  const candidate = {
    state: 'candidate' as const, table, sql: baseline.slice(0, 1000).map((value, index) => ({ value, columns: [...(provenance.get(query.parameters[index]) ?? [])] })),
    http: http === undefined ? { state: 'unavailable' } : sanitizeAuditInput(http),
    suppressHttp: suppressHttpForTable(table), truncated: query.parameters.length > 1000
  }
  const serialized = JSON.stringify(candidate)
  // Sanitization can replace an oversized/deep value with a small marker. Keep
  // the envelope's completeness flag consistent with that partial snapshot.
  candidate.truncated ||= serialized.includes('[TRUNCATED]')
  if (Buffer.byteLength(serialized) <= 24000) return candidate
  return { state: 'unavailable' as const, table, sql: [], http: { state: 'unavailable' }, truncated: true }
}

export const finalizeAuditInputs = (candidate: ReturnType<typeof prepareAuditInputCandidate>, metadata?: AuditStatementMetadata | null) => {
  if (candidate.state !== 'candidate') return { state: 'unavailable', truncated: true }
  return { state: 'captured',
    sql: candidate.sql.map(binding => metadata?.table === candidate.table && metadata.excludedColumns
      && !binding.columns.some(column => metadata.excludedColumns!.includes(column))
      ? binding.value
      : '[REDACTED]'),
    http: candidate.suppressHttp
      ? { state: 'unavailable', reason: 'sensitive_table' }
      : candidate.http,
    truncated: candidate.truncated }
}

export const redactedAuditInputs = (query: CompiledQuery, http?: unknown) =>
  finalizeAuditInputs(prepareAuditInputCandidate(query, http))
