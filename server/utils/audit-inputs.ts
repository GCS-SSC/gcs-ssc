/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Internal bounded snapshot helpers. */
import type { CompiledQuery } from 'kysely'

const REDACTED = '[REDACTED]'
const sensitive = /password|passwd|token|cookie|authorization|api.?key|secret|credential|encrypted|cipher|private.?key|(^|_)salt($|_)/i
export type AuditCapturePolicy = ReadonlyMap<string, readonly string[]>

/**
 * Sanitizes before serialization; never invokes user-controlled toJSON methods.
 */
export const sanitizeAuditInput = (value: unknown, depth = 0, budget = { remaining: 24000 }): unknown => {
  if (depth > 20 || budget.remaining <= 0) return '[TRUNCATED]'
  budget.remaining -= 16
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'number') return Number.isFinite(value) ? value : '[UNAVAILABLE]'
  if (typeof value === 'string') {
    if (Buffer.byteLength(value) > budget.remaining) {
      budget.remaining = 0
      return '[TRUNCATED]'
    }
    // Encoded documents may contain credentials under otherwise innocuous column names.
    if (/^\s*[[{]/.test(value)) {
      try {
        const exact = value.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token => token.startsWith('"') ? token : JSON.stringify(token))
        return sanitizeAuditInput(JSON.parse(exact), depth + 1, budget)
      } catch {
        return '[REDACTED: malformed document]'
      }
    }
    try {
      const url = new URL(value)
      if (url.username || url.password || [...url.searchParams.keys()].some(key => sensitive.test(key))) return REDACTED
    } catch { /* Most business strings are not URLs. */ }
    if (/(?:Bearer|Basic)\s+\S+|(?:authorization|password|passwd|token|secret|api[_-]?key|credential)\s*[=:]\s*\S+|[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]+@/i.test(value)) return REDACTED
    const size = Buffer.byteLength(value)
    if (size > budget.remaining) {
      budget.remaining = 0
      return '[TRUNCATED]'
    }
    budget.remaining -= size
    return value
  }
  if (value instanceof Date) return Number.isFinite(Date.prototype.getTime.call(value))
    ? Date.prototype.toISOString.call(value)
    : '[UNAVAILABLE]'
  if (Array.isArray(value)) {
    if (value.length > 1000) return '[TRUNCATED]'
    return Array.from({ length: value.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      return descriptor && Object.hasOwn(descriptor, 'value')
        ? sanitizeAuditInput(descriptor.value, depth + 1, budget)
        : '[UNAVAILABLE]'
    })
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    if (Object.keys(value).length > 1000) return '[TRUNCATED]'
    return Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(value))
      .filter(([, descriptor]) => descriptor.enumerable).map(([key, descriptor]) => {
        budget.remaining -= Buffer.byteLength(key)
        return [key, sensitive.test(key)
          ? REDACTED
          : Object.hasOwn(descriptor, 'value')
            ? sanitizeAuditInput(descriptor.value, depth + 1, budget)
            : '[UNAVAILABLE]']
      }))
  }
  return '[UNAVAILABLE]'
}

type Node = { kind?: string; [key: string]: unknown }
const node = (value: unknown): Node | undefined => value && typeof value === 'object' ? value as Node : undefined
const columnName = (value: unknown): string | undefined => {
  const current = node(value)
  if (current?.kind === 'ReferenceNode') return columnName(current.column)
  if (current?.kind === 'ColumnNode') return node(current.column)?.name as string | undefined
  return undefined
}

/**
 * Only bindings tied to a single installed table and a known safe column are captured.
 */
export const captureAuditParameters = (query: CompiledQuery, policies: AuditCapturePolicy): unknown[] => {
  const tables = new Set<string>()
  const findTables = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(findTables)
      return
    }
    const current = value as Node
    if (current.kind === 'TableNode') {
      const table = node(current.table)
      tables.add(`${node(table?.schema)?.name ?? 'public'}.${node(table?.identifier)?.name}`)
    }
    Object.values(current).forEach(findTables)
  }
  findTables(query.query)
  const table = tables.size === 1 ? [...tables][0] : undefined
  const exclusions = table ? policies.get(table) : undefined
  if (!table || !exclusions || /(?:^|\.)(account|session|verification)$|secret|credential/i.test(table)) {
    return query.parameters.slice(0, 1000).map(() => REDACTED)
  }
  const safe = new Set<unknown>()
  const unsafe = new Set<unknown>()
  const visit = (value: unknown, column?: string): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(entry => visit(entry, column))
      return
    }
    const current = value as Node
    if (current.kind === 'ValueNode') {
      if (current.immediate) return
      const allowed = column && !sensitive.test(column) && !exclusions.includes(column)
      ;(allowed ? safe : unsafe).add(current.value)
      return
    }
    if (current.kind === 'PrimitiveValueListNode') {
      for (const entry of current.values as unknown[]) (column && !sensitive.test(column) && !exclusions.includes(column) ? safe : unsafe).add(entry)
      return
    }
    if (current.kind === 'ColumnUpdateNode') {
      visit(current.value, columnName(current.column))
      return
    }
    if (current.kind === 'BinaryOperationNode') {
      visit(current.leftOperand, columnName(current.rightOperand))
      visit(current.rightOperand, columnName(current.leftOperand))
      return
    }
    if (current.kind === 'InsertQueryNode') {
      const columns = (current.columns as unknown[] | undefined)?.map(columnName) ?? []
      const values = node(current.values)
      if (values?.kind === 'ValuesNode') {
        for (const row of values.values as Node[]) {
          if (row.kind === 'PrimitiveValueListNode') {
            (row.values as unknown[]).forEach((entry, index) => visit({ kind: 'ValueNode', value: entry }, columns[index]))
          } else (row.values as unknown[]).forEach((entry, index) => visit(entry, columns[index]))
        }
      } else visit(current.values)
      Object.entries(current).filter(([key]) => key !== 'values').forEach(([, entry]) => visit(entry))
      return
    }
    Object.values(current).forEach(entry => visit(entry, current.kind === 'RawNode' ? undefined : column))
  }
  visit(query.query)
  return query.parameters.slice(0, 1000).map(value => safe.has(value) && !unsafe.has(value) ? sanitizeAuditInput(value) : REDACTED)
}

export const captureAuditInputs = (query: CompiledQuery, policies: AuditCapturePolicy, http?: unknown) => {
  const snapshot = {
    state: 'captured',
    sql: captureAuditParameters(query, policies),
    http: http === undefined ? { state: 'unavailable' } : sanitizeAuditInput(http),
    truncated: query.parameters.length > 1000
  }
  const serialized = JSON.stringify(snapshot)
  // Leave room for PostgreSQL jsonb's whitespace-normalized serialization.
  if (Buffer.byteLength(serialized) > 24000 || serialized.includes('[TRUNCATED]')) {
    return { state: 'unavailable', truncated: true }
  }
  return snapshot
}

/**
 * Infrastructure evidence never inherits an agency business-operation scope.
 */
export const isGlobalAuditQuery = (query: CompiledQuery): boolean => {
  let global = query.query.kind === 'RawNode'
  const inspect = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(inspect)
      return
    }
    const current = value as Node
    if (current.kind === 'TableNode') {
      const table = node(current.table)
      const schema = node(table?.schema)?.name ?? 'public'
      const name = String(node(table?.identifier)?.name)
      if (schema === 'audit' || String(schema).startsWith('pg_') || schema === 'information_schema'
        || ['user', 'account', 'session', 'verification', 'role', 'role_permission', 'user_role_assignment', 'role_transfer_payment_scope', 'Common_User', 'Common_GWCOA'].includes(name)) global = true
    }
    Object.values(current).forEach(inspect)
  }
  inspect(query.query)
  return global
}
