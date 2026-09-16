/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Conservative structured-query ownership inference. */
import type { CompiledQuery, OperationNode } from 'kysely'
import { AUDIT_TABLE_OWNERSHIP, type AuditOwnershipRule } from '../database/audit-ownership-registry'
import { createAuditOwnershipResolver, type AuditOwnership, type AuditOwnershipRow, type AuditOwnershipSource } from './audit-ownership'

type Node = Record<string, unknown>
const node = (value: unknown): Node | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Node : undefined
const text = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined
const identifier = (value: unknown) => text(node(value)?.name)
/** Preserve schema identity when two sources share a table name. */
const referenceQualifier = (reference: Node): string | undefined => {
  const table = node(node(reference.table)?.table)
  const name = identifier(table?.identifier)
  const schema = identifier(table?.schema)
  return name && schema ? `${schema}.${name}` : name
}
const scalar = (value: unknown): string | undefined => typeof value === 'string' || typeof value === 'bigint'
  ? String(value)
  : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : undefined

/** Carry structured write predicates into the business statement's own snapshot. */
export const auditWritePredicate = (query: CompiledQuery): { table: string; rows?: AuditOwnershipRow[]; patches?: { column: string | undefined; literal: boolean; value: string | null }[]; reason?: string } | null => {
  const root = node(query.query)
  if (!root || !['UpdateQueryNode', 'DeleteQueryNode'].includes(String(root.kind))) return null
  const froms = node(root.from)?.froms
  const selected = node(root.kind === 'UpdateQueryNode' ? root.table : Array.isArray(froms) ? froms[0] : undefined)
  const target = selected?.kind === 'AliasNode' ? node(selected.node) : selected
  const tableNode = node(target?.table)
  const name = identifier(tableNode?.identifier)
  if (!name) return null
  const table = `${identifier(tableNode?.schema) ?? 'public'}.${name}`
  const alias = identifier(selected?.alias)
  const rows = auditPredicateRows(root.where, alias ? [alias] : [name, table])
  if (!rows) return { table, reason: 'ownership_predicate_limit' }
  const patches = Array.isArray(root.updates)
    ? root.updates.map(value => {
        const update = node(value)
        const column = identifier(node(update?.column)?.column)
        const expression = node(update?.value)
        return { column, literal: expression?.kind === 'ValueNode', value: scalar(expression?.value) ?? null }
      })
    : []
  const candidate = { table, rows, patches }
  return JSON.stringify(candidate).length <= 32768 ? candidate : { table, reason: 'ownership_predicate_limit' }
}

/** Extracts only mandatory equality predicates on the main table; OR and nested SELECTs never supply owners. */
const equalities = (input: unknown, aliases: readonly string[]): Record<string, string> => {
  const current = node(input)
  if (!current) return {}
  if (current.kind === 'WhereNode' || current.kind === 'ParensNode') return equalities(current.where ?? current.node, aliases)
  if (current.kind === 'AndNode') {
    const left = equalities(current.left, aliases)
    const right = equalities(current.right, aliases)
    if (Object.keys(left).some(key => Object.hasOwn(right, key) && left[key] !== right[key])) return {}
    return { ...left, ...right }
  }
  if (current.kind !== 'BinaryOperationNode' || node(current.operator)?.operator !== '=') return {}
  const operands = [node(current.leftOperand), node(current.rightOperand)]
  const left = operands.find(operand => operand?.kind === 'ReferenceNode')
  const right = operands.find(operand => operand?.kind === 'ValueNode')
  if (!left || !right) return {}
  const qualifier = referenceQualifier(left)
  if (qualifier && !aliases.includes(qualifier)) return {}
  const column = identifier(node(left.column)?.column)
  const value = scalar(right.value)
  return column && value !== undefined ? { [column]: value } : {}
}

/** A mandatory literal list bounds a row identity or ownership reference. */
const ownershipList = (input: unknown, aliases: readonly string[]): { column: string; values: string[] } | undefined => {
  const current = node(input)
  if (!current) return undefined
  if (current.kind === 'WhereNode' || current.kind === 'ParensNode') return ownershipList(current.where ?? current.node, aliases)
  if (current.kind === 'AndNode') return ownershipList(current.left, aliases) ?? ownershipList(current.right, aliases)
  if (current.kind !== 'BinaryOperationNode' || node(current.operator)?.operator !== 'in') return undefined
  const left = node(current.leftOperand)
  const right = node(current.rightOperand)
  if (left?.kind !== 'ReferenceNode' || right?.kind !== 'PrimitiveValueListNode' || !Array.isArray(right.values)) return undefined
  const qualifier = referenceQualifier(left)
  if (qualifier && !aliases.includes(qualifier)) return undefined
  if (!right.values.length || right.values.length > 1000) return undefined
  const column = identifier(node(left.column)?.column)
  const ids = right.values.map(scalar)
  return column && ids.every((id): id is string => id !== undefined) ? { column, values: [...new Set(ids)] } : undefined
}

/** Combined SQL evidence can be shared only when every contributing row has the same audience. */
export const combinedScope = (scopes: AuditOwnership[]): AuditOwnership => {
  if (!scopes.length) return { type: 'unresolved', reason: 'statement_returned_no_ownership' }
  const unresolved = scopes.find(scope => scope.type === 'unresolved')
  if (unresolved) return unresolved
  const first = scopes[0]!
  const sameAudience = scopes.every(scope => scope.type === first.type && (
    scope.type === 'global' || (scope.type === 'agency' && first.type === 'agency' && JSON.stringify(scope.agencyIds) === JSON.stringify(first.agencyIds))
  ))
  return sameAudience ? first : { type: 'global', reason: 'Query spans distinct ownership audiences' }
}

/** Reads literal INSERT values from structured nodes, without evaluating SQL expressions. */
const insertedRows = (root: Node): AuditOwnershipRow[] | undefined => {
  if ((root.onConflict && node(root.onConflict)?.doNothing !== true) || root.onDuplicateKey || !Array.isArray(root.columns)) return undefined
  const columns = root.columns.map(column => identifier(node(column)?.column))
  const values = node(root.values)
  if (columns.some(column => !column) || values?.kind !== 'ValuesNode' || !Array.isArray(values.values)) return undefined
  const rows: AuditOwnershipRow[] = []
  for (const value of values.values) {
    const list = node(value)
    if (!Array.isArray(list?.values) || list.values.length !== columns.length) return undefined
    let entries: unknown[]
    if (list.kind === 'PrimitiveValueListNode') entries = list.values
    else if (list.kind === 'ValueListNode' && list.values.every(item => node(item)?.kind === 'ValueNode')) {
      entries = list.values.map(item => node(item)?.value)
    } else return undefined
    rows.push(Object.fromEntries(columns.map((column, index) => [column!, entries[index]])))
  }
  return rows.length ? rows : undefined
}

/** Expand mandatory alternatives with a small bound; each branch must independently resolve. */
const predicateBranches = (input: unknown): unknown[] | undefined => {
  const current = node(input)
  if (!current) return [input]
  if (current.kind === 'WhereNode' || current.kind === 'ParensNode') return predicateBranches(current.where ?? current.node)
  if (current.kind !== 'AndNode' && current.kind !== 'OrNode') return [input]
  const left = predicateBranches(current.left)
  const right = predicateBranches(current.right)
  if (!left || !right) return undefined
  if (current.kind === 'OrNode') return left.length + right.length <= 32 ? [...left, ...right] : undefined
  if (left.length * right.length > 32) return undefined
  return left.flatMap(leftBranch => right.map(rightBranch => ({ kind: 'AndNode', left: leftBranch, right: rightBranch })))
}

/** Literal constraints for every mandatory alternative, without looking up current rows. */
export const auditPredicateRows = (where: unknown, aliases: readonly string[], options: { requireQualified?: boolean } = {}): AuditOwnershipRow[] | undefined => {
  const branches = predicateBranches(where)
  if (!branches) return undefined
  const rows: AuditOwnershipRow[] = []
  for (const branch of branches) {
    const constraints = new Map<string, Set<string>>()
    /** Collect every literal in this conjunction without crossing OR alternatives. */
    const collect = (input: unknown): void => {
      const current = node(input)
      if (!current) return
      if (current.kind === 'AndNode') {
        collect(current.left)
        collect(current.right)
        return
      }
      if (current.kind === 'WhereNode' || current.kind === 'ParensNode') {
        collect(current.where ?? current.node)
        return
      }
      if (current.kind !== 'BinaryOperationNode') return
      const operator = node(current.operator)?.operator
      const operands = [node(current.leftOperand), node(current.rightOperand)]
      const reference = operands.find(operand => operand?.kind === 'ReferenceNode')
      const value = operands.find(operand => operand?.kind === 'ValueNode' || operand?.kind === 'PrimitiveValueListNode')
      if (!reference || !value || !['=', 'in'].includes(String(operator))) return
      const qualifier = referenceQualifier(reference)
      if ((!qualifier && options.requireQualified) || (qualifier && !aliases.includes(qualifier))) return
      const column = identifier(node(reference.column)?.column)
      if (!column) return
      const entries = operator === '=' && value.kind === 'ValueNode'
        ? [value.value]
        : operator === 'in' && value.kind === 'PrimitiveValueListNode' && Array.isArray(value.values) ? value.values : []
      const values = entries.map(scalar)
      if (!values.length || values.some(entry => entry === undefined)) return
      const existing = constraints.get(column) ?? new Set<string>()
      // Keep every attempted literal, including contradictory constraints. Intersecting
      // them would erase attempted owners merely because the business result is empty.
      for (const entry of values) existing.add(entry!)
      constraints.set(column, existing)
    }
    collect(branch)
    let alternatives: AuditOwnershipRow[] = [{}]
    for (const [column, values] of constraints) {
      if (alternatives.length * values.size + rows.length > 1000) return undefined
      alternatives = alternatives.flatMap(row => [...values].map(value => ({ ...row, [column]: value })))
    }
    rows.push(...alternatives)
    if (rows.length > 1000) return undefined
  }
  return rows
}

/** Bind an optional source's mandatory keys to literals or preceding source rows. */
export const auditJoinPredicateRows = (where: unknown, aliases: readonly string[], precedingAliases: readonly string[]): Record<string, OperationNode>[] | undefined => {
  const branches = predicateBranches(where)
  if (!branches) return undefined
  const result: Record<string, OperationNode>[] = []
  for (const branch of branches) {
    const literals = auditPredicateRows(branch, aliases, { requireQualified: true })
    if (!literals) return undefined
    const references = new Map<string, OperationNode[]>()
    /** Reference equality constrains only the optional side; never the preserved side. */
    const collect = (input: unknown): void => {
      const current = node(input)
      if (!current) return
      if (current.kind === 'AndNode') {
        collect(current.left)
        collect(current.right)
        return
      }
      if (current.kind === 'WhereNode' || current.kind === 'ParensNode') {
        collect(current.where ?? current.node)
        return
      }
      if (current.kind !== 'BinaryOperationNode' || node(current.operator)?.operator !== '=') return
      const operands = [node(current.leftOperand), node(current.rightOperand)]
      if (operands.some(operand => operand?.kind !== 'ReferenceNode')) return
      for (const [index, reference] of operands.entries()) {
        const other = operands[1 - index]!
        const qualifier = referenceQualifier(reference!)
        const otherQualifier = referenceQualifier(other)
        const column = identifier(node(reference!.column)?.column)
        if (!column || !qualifier || !aliases.includes(qualifier) || !otherQualifier || !precedingAliases.includes(otherQualifier)) continue
        references.set(column, [...(references.get(column) ?? []), other as unknown as OperationNode])
      }
    }
    collect(branch)
    for (const literal of literals) {
      let rows: Record<string, OperationNode>[] = [Object.fromEntries(Object.entries(literal)
        .map(([column, value]) => [column, { kind: 'ValueNode', value }]))]
      for (const [column, values] of references) {
        const choices = rows[0]![column] ? [rows[0]![column]!, ...values] : values
        if (result.length + rows.length * choices.length > 1000) return undefined
        rows = rows.flatMap(row => choices.map(value => ({ ...row, [column]: value })))
      }
      result.push(...rows)
      if (result.length > 1000) return undefined
    }
  }
  return result
}

/** Columns on this row that can change its ownership, derived from the single registry. */
const ownershipColumns = (rule: AuditOwnershipRule): string[] => {
  switch (rule.kind) {
    case 'agency': case 'parent': return [rule.column]
    case 'entity': return [rule.idColumn, rule.typeColumn]
    case 'encoded-entity': return [rule.column, rule.dimensionColumn]
    case 'switch': return [rule.column, ...Object.values(rule.cases).flatMap(ownershipColumns)]
    case 'first': return rule.rules.flatMap(ownershipColumns)
    case 'references': return ['id']
    case 'stored-audience': return ['scope_type', 'agency_id', 'agency_ids']
    default: return []
  }
}

/** Nested statements contribute their own evidence and cannot inherit the outer table's owner. */
const hasNestedQuery = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasNestedQuery)
  const current = node(value)
  if (!current) return false
  if (typeof current.kind === 'string' && ['SelectQueryNode', 'InsertQueryNode', 'UpdateQueryNode', 'DeleteQueryNode'].includes(current.kind)) return true
  return Object.values(current).some(hasNestedQuery)
}

/** Joined-table inference accepts only qualified predicates, never ambiguous bare columns. */
const qualifiedPredicates = (input: unknown): unknown => {
  const current = node(input)
  if (!current) return input
  if (current.kind === 'WhereNode') return { ...current, where: qualifiedPredicates(current.where) }
  if (current.kind === 'ParensNode') return { ...current, node: qualifiedPredicates(current.node) }
  if (current.kind === 'AndNode') return { ...current, left: qualifiedPredicates(current.left), right: qualifiedPredicates(current.right) }
  if (current.kind === 'BinaryOperationNode' && [current.leftOperand, current.rightOperand].some(operand =>
    node(operand)?.kind === 'ReferenceNode' && node(operand)?.table)) return current
  return {}
}

export type AuditQueryOwnership = { table: string | null; scope: AuditOwnership }

/** Resolves an owner before execution without replaying the query or using another connection. */
export const resolveAuditQueryOwnership = async (query: CompiledQuery, source: AuditOwnershipSource): Promise<AuditQueryOwnership> => {
  const root = node(query.query)!
  if (Object.values(root).some(hasNestedQuery)) {
    return { table: null, scope: { type: 'unresolved', reason: 'nested_query_requires_ownership' } }
  }
  if ((root.kind === 'UpdateQueryNode' && root.from) || (root.kind === 'DeleteQueryNode' && root.using)) {
    return { table: null, scope: { type: 'unresolved', reason: 'multi_table_write_requires_ownership' } }
  }
  const branches = predicateBranches(root.where)
  if (!branches) return { table: null, scope: { type: 'unresolved', reason: 'ownership_predicate_limit' } }
  if (branches.length > 1) {
    const resolutions = await Promise.all(branches.map(where => resolveAuditQueryOwnership({ ...query,
      query: { ...root, where: { kind: 'WhereNode', where } } as unknown as CompiledQuery['query']
    }, source)))
    return { table: resolutions[0]!.table, scope: combinedScope(resolutions.map(result => result.scope)) }
  }
  const from = node(root.from)?.froms
  const roots = Array.isArray(from) ? from : root.into ? [root.into] : root.table ? [root.table] : []
  if (roots.length !== 1 || root.with || root.setOperations) {
    return { table: null, scope: { type: 'unresolved', reason: 'query_requires_explicit_ownership' } }
  }
  if (Array.isArray(root.joins) && root.joins.length > 0) {
    if (root.kind !== 'SelectQueryNode' || root.joins.some(join => node(join)?.joinType !== 'InnerJoin')) {
      return { table: null, scope: { type: 'unresolved', reason: 'query_requires_explicit_ownership' } }
    }
    const tables = [...roots, ...root.joins.map(join => node(join)?.table)]
    const predicates = [node(root.where)?.where, ...root.joins.map(join => node(node(join)?.on)?.on)]
      .filter(predicate => predicate !== undefined)
    const mandatoryWhere = { kind: 'WhereNode', where: predicates.reduce<unknown>((left, right) =>
      left ? { kind: 'AndNode', left, right } : right, undefined) }
    const scopes = await Promise.all(tables.map(async selectedTable => {
      const isolated = { ...root, joins: undefined, from: { kind: 'FromNode', froms: [selectedTable] },
        where: qualifiedPredicates(mandatoryWhere) }
      return (await resolveAuditQueryOwnership({ ...query, query: isolated as unknown as CompiledQuery['query'] }, source)).scope
    }))
    return { table: null, scope: combinedScope(scopes) }
  }
  const selected = node(roots[0])
  const tableNode = selected?.kind === 'AliasNode' ? node(selected.node) : selected
  const tableName = identifier(node(tableNode?.table)?.identifier)
  const schema = identifier(node(tableNode?.table)?.schema) ?? 'public'
  if (!tableName || tableNode?.kind !== 'TableNode') return { table: null, scope: { type: 'unresolved', reason: 'query_requires_explicit_ownership' } }
  const table = `${schema}.${tableName}`
  const registry = source.getRegistry ? await source.getRegistry() : source.registry ?? AUDIT_TABLE_OWNERSHIP
  const rule = Object.hasOwn(registry, table) ? registry[table] : undefined
  if (!rule && schema === 'extensions') return { table, scope: { type: 'global', reason: 'Extension has not declared agency ownership' } }
  if (!rule) return { table, scope: { type: 'unresolved', reason: 'unregistered_table' } }
  const resolver = createAuditOwnershipResolver(source)
  if (rule.kind === 'global' || rule.kind === 'actor-agencies') return { table, scope: await resolver.resolveRow(table, {}) }
  if (root.kind === 'InsertQueryNode') {
    const rows = insertedRows(root)
    if (!rows) return { table, scope: { type: 'unresolved', reason: 'insert_requires_explicit_ownership' } }
    const scopes = await Promise.all(rows.map(row => resolver.resolveRow(table, row)))
    return { table, scope: combinedScope(scopes) }
  }
  const alias = identifier(selected?.alias)
  const aliases = alias ? [alias] : [tableName, table]
  const values: AuditOwnershipRow = equalities(root.where, aliases)
  if (root.kind === 'UpdateQueryNode' && Array.isArray(root.updates)) {
    const columns = new Set(ownershipColumns(rule))
    const updates = root.updates.map(node).filter(update => columns.has(identifier(node(update?.column)?.column) ?? ''))
    if (updates.length) {
      if (updates.some(update => node(update?.value)?.kind !== 'ValueNode')) {
        return { table, scope: { type: 'unresolved', reason: 'ownership_update_expression' } }
      }
      const patch = Object.fromEntries(updates.map(update => [identifier(node(update?.column)?.column)!, node(update?.value)?.value]))
      const matches = typeof values.id === 'string' ? { id: values.id } : values as Record<string, string>
      if (!Object.keys(matches).length) return { table, scope: { type: 'unresolved', reason: 'ownership_update_requires_rows' } }
      const rows = await source.load(table, matches)
      if (!rows.length || rows.length > 1000) return { table, scope: { type: 'unresolved', reason: 'ownership_update_requires_rows' } }
      const scopes = await Promise.all(rows.flatMap(row => [
        resolver.resolveRow(table, row), resolver.resolveRow(table, { ...row, ...patch })
      ]))
      return { table, scope: combinedScope(scopes) }
    }
  }
  if (typeof values.id === 'string') return { table, scope: await resolver.resolveIdentity(table, values.id) }
  const list = ownershipList(root.where, aliases)
  if (list) {
    const scopes = await Promise.all(list.values.map(value => list.column === 'id'
      ? resolver.resolveIdentity(table, value)
      : resolver.resolveRow(table, { ...values, [list.column]: value })))
    const scope = combinedScope(scopes)
    if (scope.type !== 'unresolved') return { table, scope }
    // An unrelated list must not discard a separately established owner equality.
  }
  const scope = await resolver.resolveRow(table, values)
  return { table, scope }
}
