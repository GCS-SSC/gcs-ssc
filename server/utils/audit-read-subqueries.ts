/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Internal conservative query-node validation. */
type Node = Record<string, unknown>
const node = (value: unknown): Node | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Node : undefined
const name = (value: unknown): string | undefined => typeof node(value)?.name === 'string' ? node(value)!.name as string : undefined

/** Permit one bounded level of IN SELECTs whose references cannot reach an outer scope. */
export const auditReadSubqueries = (root: Node): Node[] | undefined => {
  const queries: Node[] = []
  let sources = 0
  /** Establish the complete local namespace before inspecting any expressions. */
  const validate = (query: Node): boolean => {
    if (query.with || query.setOperations || query.endModifiers || query.frontModifiers
      || query.limit || query.offset || query.groupBy || query.having || query.distinctOn) return false
    const froms = node(query.from)?.froms
    if (!Array.isArray(froms) || !froms.length) return false
    const joins = Array.isArray(query.joins) ? query.joins : []
    const local = new Set<string>()
    for (const input of [...froms, ...joins.map(join => node(join)?.table)]) {
      const selected = node(input)
      const table = selected?.kind === 'AliasNode' ? node(selected.node) : selected
      if (table?.kind !== 'TableNode' || ++sources > 16) return false
      const identifier = node(table.table)
      const tableName = name(identifier?.identifier)
      if (!tableName) return false
      const alias = name(selected?.alias)
      if (alias) local.add(alias)
      else {
        local.add(tableName)
        local.add(`${name(identifier?.schema) ?? 'public'}.${tableName}`)
      }
    }
    /** Require qualified local references and reject hidden or deeper queries. */
    const scan = (value: unknown): boolean => {
      if (Array.isArray(value)) return value.every(scan)
      const current = node(value)
      if (!current || current.kind === 'ValueNode' || current.kind === 'PrimitiveValueListNode') return true
      // Evaluated independently even when the outer predicate short-circuits:
      // only non-computing relational nodes may contribute nested evidence.
      if (!['FromNode', 'TableNode', 'SchemableIdentifierNode', 'IdentifierNode', 'AliasNode',
        'ReferenceNode', 'ColumnNode', 'SelectionNode', 'SelectAllNode', 'JoinNode', 'OnNode',
        'WhereNode', 'BinaryOperationNode', 'OperatorNode', 'AndNode', 'OrNode', 'ParensNode',
        'ValueListNode'].includes(String(current.kind))) return false
      if (current.kind === 'BinaryOperationNode' && !['=', '!=', '<>', '<', '>', '<=', '>=', 'is', 'is not', 'in', 'not in']
        .includes(String(node(current.operator)?.operator))) return false
      if (current.kind === 'ReferenceNode') {
        const qualifier = node(node(current.table)?.table)
        const tableName = name(qualifier?.identifier)
        const schema = name(qualifier?.schema)
        if (!tableName || !local.has(schema ? `${schema}.${tableName}` : tableName)) return false
      }
      return Object.values(current).every(scan)
    }
    return Object.values(query).every(scan)
  }
  /** Only direct IN operands can introduce independently evaluated sources. */
  const visit = (value: unknown, parent?: Node, key?: string): boolean => {
    if (Array.isArray(value)) return value.every(item => visit(item, parent, key))
    const current = node(value)
    if (!current || current.kind === 'ValueNode' || current.kind === 'PrimitiveValueListNode') return true
    if (current.kind === 'SelectQueryNode') {
      if (parent?.kind !== 'BinaryOperationNode' || key !== 'rightOperand'
        || !['in', 'not in'].includes(String(node(parent.operator)?.operator))
        || queries.length >= 4 || !validate(current)) return false
      queries.push(current)
      return true
    }
    return Object.entries(current).every(([childKey, child]) => visit(child, current, childKey))
  }
  return Object.values(root).every(value => visit(value)) ? queries : undefined
}
