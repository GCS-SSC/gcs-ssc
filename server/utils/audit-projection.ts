/* eslint-disable jsdoc/require-jsdoc -- Conservative projection analysis never retains full rows. */
import type { CompiledQuery } from 'kysely'

interface Node {
  kind: string
  name?: string
  table?: Node
  schema?: Node
  identifier?: Node
  alias?: Node
  node?: Node
  column?: Node
  selection?: Node
  selections?: Node[]
  returning?: Node
  from?: { froms: Node[] }
  into?: Node
  joins?: Node[]
  groupBy?: Node
  distinctOn?: Node[]
  setOperations?: Node[]
}
export const auditProjection = (query: CompiledQuery, keys: ReadonlyMap<string, string[]>) => {
  const node = query.query as Node
  const sources = node.from?.froms ?? (node.into ? [node.into] : node.table ? [node.table] : [])
  if (sources.length !== 1 || node.joins?.length || node.groupBy || node.setOperations?.length) return null
  const source = sources[0]!
  const table = source.kind === 'AliasNode' ? source.node : source
  if (table?.kind !== 'TableNode') return null
  const tableName = table.table?.identifier?.name
  const schema = table.table?.schema?.name ?? 'public'
  const reference = `${schema}.${tableName}`
  const primary = keys.get(reference)
  if (!primary?.length) return null
  const selections = node.returning?.selections ?? node.selections
  if (!selections) return { table: reference, fields: null }
  const fields = new Map<string, string>()
  for (const selection of selections) {
    const value = selection.selection
    const original = value?.kind === 'AliasNode' ? value.node : value
    if (original?.kind === 'SelectAllNode' || original?.column?.kind === 'SelectAllNode') {
      for (const key of primary) fields.set(key, key)
    } else if (original?.kind === 'ReferenceNode') {
      const column = original.column?.column?.name
      if (column && primary.includes(column)) fields.set(column, value?.alias?.name ?? column)
    } else return { table: reference, fields: null }
  }
  return { table: reference, fields: primary.every(key => fields.has(key)) ? fields : null }
}

export const returnedAuditIdentities = (rows: unknown[], projection: ReturnType<typeof auditProjection>): unknown[] | null => {
  if (!projection?.fields) return null
  const result: unknown[] = []
  for (const row of rows.slice(0, 1000)) {
    if (typeof row !== 'object' || row === null) return null
    const identity: Record<string, string> = {}
    for (const [column, alias] of projection.fields) {
      const value = (row as Record<string, unknown>)[alias]
      if (typeof value !== 'string' && typeof value !== 'bigint' && !(typeof value === 'number' && Number.isSafeInteger(value))) return null
      identity[column] = String(value)
    }
    result.push({ table: projection.table, keys: identity })
  }
  return result
}
