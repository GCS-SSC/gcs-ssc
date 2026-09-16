/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Internal structured statement transformation. */
import { PostgresQueryCompiler, sql, type CompiledQuery, type OperationNode, type RawBuilder, type SelectQueryNode } from 'kysely'
import { auditReadSubqueries } from './audit-read-subqueries'
import { auditJoinPredicateRows, auditPredicateRows } from './audit-query-ownership'
import type { AuditOwnership } from './audit-ownership'
import type { AuditStatementMetadata } from './audit-statement-metadata'

type Node = Record<string, unknown>
const node = (value: unknown): Node | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Node : undefined
const name = (value: unknown): string | undefined => typeof node(value)?.name === 'string' ? node(value)!.name as string : undefined
const pureFunctions = new Set(['count', 'sum', 'avg', 'min', 'max', 'coalesce', 'nullif', 'lower'])
const expressionWords = new Set([...pureFunctions, 'cast', 'as', 'text', 'numeric', 'decimal', 'bigint', 'integer',
  'distinct', 'null', 'true', 'false', 'case', 'when', 'then', 'else', 'end', 'is', 'not', 'and', 'or'])
/** Recognize only built-in arithmetic/aggregate templates; identifiers remain structured children. */
const pureRawTemplate = (current: Node): boolean => {
  if (!Array.isArray(current.sqlFragments) || !Array.isArray(current.parameters)) return false
  const template = current.sqlFragments.join(' 0 ')
  if (/--|\/\*|\*\//.test(template) || /[^a-zA-Z0-9_\s().,+*/%:<>=!|-]/.test(template)) return false
  if (/[a-zA-Z_][a-zA-Z_0-9]*\s*\.|\.\s*[a-zA-Z_]/.test(template)) return false
  const words = template.match(/[a-zA-Z_][a-zA-Z_0-9]*/g) ?? []
  return words.every(word => expressionWords.has(word.toLowerCase()))
}

/** Reject shapes whose projection cannot yet carry row ownership without changing semantics. */
const unsupported = (value: unknown, mode: 'read' | 'write' = 'read', subqueries: ReadonlySet<Node> = new Set()): boolean => {
  if (Array.isArray(value)) return value.some(item => unsupported(item, mode, subqueries))
  const current = node(value)
  if (!current) return false
  if (subqueries.has(current)) return false
  if (current.kind === 'RawNode' && Array.isArray(current.sqlFragments)
    && current.sqlFragments.length === 2 && current.sqlFragments.every(fragment => /^\s*$/.test(String(fragment)))
    && Array.isArray(current.parameters) && current.parameters.length === 1) {
    // sql.ref and transparent expression wrappers retain a structured child.
    return unsupported(current.parameters[0], mode, subqueries)
  }
  if (mode === 'write' && current.kind === 'RawNode') {
    const fragments = current.sqlFragments
    const parameters = current.parameters
    // The host JSON writer's fixed cast cannot read another ownership source.
    if (Array.isArray(fragments) && fragments.length === 2 && /^\s*$/.test(String(fragments[0]))
      && /^\s*::(?:pg_catalog\.)?jsonb\s*$/i.test(String(fragments[1]))
      && Array.isArray(parameters) && parameters.length === 1 && node(parameters[0])?.kind === 'ValueNode') return false
  }
  if (current.kind === 'OrderByItemNode') {
    const direction = node(current.direction)
    if (direction?.kind === 'RawNode' && Array.isArray(direction.sqlFragments)
      && direction.sqlFragments.length === 1 && /^(asc|desc)$/i.test(String(direction.sqlFragments[0]))
      && Array.isArray(direction.parameters) && !direction.parameters.length) {
      return unsupported(current.orderBy, mode, subqueries)
    }
  }
  if (current.kind === 'RawNode' && mode === 'read' && pureRawTemplate(current)) {
    return unsupported(current.parameters, mode, subqueries)
  }
  if (current.kind === 'FunctionNode' || current.kind === 'AggregateFunctionNode') {
    return !pureFunctions.has(String(current.func).toLowerCase())
      || Object.entries(current).some(([key, value]) => key !== 'func' && unsupported(value, mode, subqueries))
  }
  if (['SelectQueryNode', 'RawNode', 'OverNode'].includes(String(current.kind))) return true
  return Object.values(current).some(item => unsupported(item, mode, subqueries))
}

/** Accept only Kysely lock strengths and their structured wait modifiers. */
const lockingModifiers = (value: unknown): boolean => {
  if (!Array.isArray(value) || !value.length) return false
  const locks = new Set(['ForUpdate', 'ForNoKeyUpdate', 'ForShare', 'ForKeyShare'])
  return value.filter(item => locks.has(String(node(item)?.modifier))).length === 1
    && value.every(item => node(item)?.kind === 'SelectModifierNode'
      && [...locks, 'SkipLocked', 'NoWait'].includes(String(node(item)?.modifier)))
}

/** PostgreSQL cannot lock grouped rows; reject aggregates even inside raw templates. */
const containsAggregate = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsAggregate)
  const current = node(value)
  if (!current) return false
  if (current.kind === 'AggregateFunctionNode') return true
  if (current.kind === 'FunctionNode' && ['count', 'sum', 'avg', 'min', 'max'].includes(String(current.func).toLowerCase())) return true
  if (current.kind === 'RawNode' && Array.isArray(current.sqlFragments)
    && /\b(?:count|sum|avg|min|max)\s*\(/i.test(current.sqlFragments.join(' '))) return true
  return Object.values(current).some(containsAggregate)
}

/** Preserve the business projection and compute ownership in its statement snapshot. */
export const instrumentAuditRead = (query: CompiledQuery, actor: string | null, queryId: string): { query: CompiledQuery; field: string } | undefined => {
  const root = node(query.query)!
  const nested = auditReadSubqueries(root)
  if (!nested) return undefined
  const allowedSubqueries = new Set(nested)
  const locking = lockingModifiers(root.endModifiers)
  if (root.kind !== 'SelectQueryNode' || root.with || root.setOperations
    || root.explain || root.top || root.distinctOn || root.frontModifiers || (root.endModifiers && !locking) || Object.values(root).some(value => unsupported(value, 'read', allowedSubqueries))) return undefined
  const froms = node(root.from)?.froms
  if (!Array.isArray(froms) || !froms.length) return undefined
  const joins = Array.isArray(root.joins) ? root.joins : []
  if (locking && (nested.length || froms.length !== 1 || joins.length || root.groupBy || root.having || containsAggregate(root))) return undefined
  if (joins.some(join => !['InnerJoin', 'LeftJoin'].includes(String(node(join)?.joinType)))) return undefined
  const field = `__gcs_audit_${queryId.replaceAll('-', '')}`
  if (query.sql.includes(field)) return undefined
  const sources = [...froms, ...joins.map(join => node(join)?.table)]
  let metadataTable: { schema: string; table: string } | undefined
  const predicates = [node(root.where)?.where, ...joins.filter(join => node(join)?.joinType === 'InnerJoin')
    .map(join => node(node(join)?.on)?.on)]
    .filter(predicate => predicate !== undefined)
    .reduce<unknown>((left, right) => left ? { kind: 'AndNode', left, right } : right, undefined)
  const owners = []
  let lockedOwner: RawBuilder<unknown> | undefined
  const attempted: { scope: RawBuilder<unknown>; required: boolean }[] = []
  const precedingAliases: string[] = []
  let predicateLimitExceeded = false
  const operation = (value: OperationNode) => ({ toOperationNode: () => value })
  for (const [index, source] of sources.entries()) {
    const selected = node(source)
    const table = selected?.kind === 'AliasNode' ? node(selected.node) : selected
    if (table?.kind !== 'TableNode') return undefined
    const identifier = node(table.table)
    const tableName = name(identifier?.identifier)
    if (!tableName) return undefined
    const schema = name(identifier?.schema) ?? 'public'
    if (sources.length === 1 && !nested.length) metadataTable = { schema, table: tableName }
    const alias = name(selected?.alias)
    const qualifier = alias ?? `${schema}.${tableName}`
    const aliases = alias ? [alias] : [qualifier, tableName]
    const join = index >= froms.length ? node(joins[index - froms.length]) : undefined
    const optional = join?.joinType === 'LeftJoin'
    const sourcePredicates = optional ? { kind: 'AndNode', left: predicates, right: node(join.on)?.on } : predicates
    const actualRow = sql`to_jsonb(${sql.table(qualifier)}.*)`
    const actualOwner = sql`audit.resolve_read_ownership(${`${schema}.${tableName}`},${actualRow},${actor})`
    if (locking) lockedOwner = actualOwner
    if (optional) {
      const projections = auditJoinPredicateRows(sourcePredicates, aliases, precedingAliases)
      if (!projections) predicateLimitExceeded = true
      for (const projection of projections ?? []) {
        const entries = Object.entries(projection).map(([column, value]) => sql`(${column}::text,${operation(value)}::text)`)
        const projectedRow = entries.length
          ? sql`(SELECT jsonb_object_agg(key,value)
              FROM (VALUES ${sql.join(entries)}) AS ${sql.id(`${field}_projection`)}(key,value))`
          : sql`'{}'::jsonb`
        const projectedOwner = sql`audit.resolve_read_predicate_ownership(${`${schema}.${tableName}`},
          ${projectedRow},${actor})`
        // A missing optional row still has an attempted audience. An unproved
        // branch can use a matched row, but must stay unresolved when no row exists.
        owners.push(sql`CASE WHEN ${projectedOwner}->>'type' IN ('agency','global') THEN ${projectedOwner}
          WHEN ${actualRow} IS NOT NULL THEN ${actualOwner} ELSE ${projectedOwner} END`)
      }
    } else owners.push(actualOwner)
    const rows = auditPredicateRows(sourcePredicates, aliases, { requireQualified: sources.length > 1 })
    if (!rows) predicateLimitExceeded = true
    for (const row of rows ?? []) {
      // Only rules fully determined by one mandatory owner key (or by the actor)
      // may prove an audience without loading candidate business rows.
      attempted.push({ scope: sql`audit.resolve_read_predicate_ownership(
        ${`${schema}.${tableName}`}, ${JSON.stringify(row)}::jsonb, ${actor})`, required: true })
    }
    // An outer ON condition does not restrict preserved rows. Its explicit
    // literals still contribute attempts, without replacing their real audience.
    for (const optionalJoin of joins.filter(candidate => node(candidate)?.joinType === 'LeftJoin' && candidate !== joins[index - froms.length])) {
      const extraRows = auditPredicateRows(node(node(optionalJoin)?.on)?.on, aliases, { requireQualified: true })
      if (!extraRows) predicateLimitExceeded = true
      for (const row of extraRows ?? []) {
        if (!Object.keys(row).length) continue
        attempted.push({ scope: sql`audit.resolve_read_predicate_ownership(
          ${`${schema}.${tableName}`}, ${JSON.stringify(row)}::jsonb, ${actor})`, required: false })
      }
    }
    precedingAliases.push(...aliases)
  }
  if (attempted.length > 1000) {
    predicateLimitExceeded = true
    attempted.length = 0
  }
  const envelope = sql`(SELECT jsonb_agg(value) FROM (VALUES ${sql.join(owners.map(owner => sql`(${owner})`))}) AS ${sql.id(`${field}_scopes`)}(value))`
  // Resolve the complete candidate audience before pagination or HAVING discards rows.
  // The original projection stays intact, including native bigint/numeric/date values.
  const candidates = {
    kind: 'SelectQueryNode', from: root.from, joins: root.joins, where: root.where,
    selections: [{ kind: 'SelectionNode', selection: envelope.as('audience').toOperationNode() }],
    limit: { kind: 'LimitNode', limit: { kind: 'ValueNode', value: 1001 } }
  }
  const source = (operation: Node) => ({ toOperationNode: () => operation as unknown as OperationNode })
  const marker = sql.id(`${field}_present`)
  const ordinal = sql.id(`${field}_ordinal`)
  const metadata = sql.id(field)
  const attemptsName = sql.id(`${field}_attempts`)
  const businessName = sql.id(`${field}_business`)
  const audienceName = sql.id(`${field}_audience`)
  const statementField = sql.id(`${field}_statement`)
  const lockedField = `${field}_locked_scope`
  // LockRows can return an updated tuple after waiting at READ COMMITTED. Keep
  // this expression inside its targetlist so EvalPlanQual recomputes ownership
  // from that tuple, rather than resolving the pre-wait predicate snapshot only.
  const businessRoot = lockedOwner
    ? { ...root, selections: [
        ...(Array.isArray(root.selections) ? root.selections : []),
        { kind: 'SelectionNode', selection: lockedOwner.as(lockedField).toOperationNode() }
      ] }
    : root
  if (!attempted.length) attempted.push({ scope: sql`'{"type":"unresolved","reason":"predicate_owner_unproven"}'::jsonb`, required: true })
  const nestedEvidence: RawBuilder<unknown>[] = []
  for (const [index, nestedRoot] of nested.entries()) {
    const nestedId = `${queryId}_sub${index}`
    // This copy contributes evidence only. Candidate/attempt resolution ignores
    // pagination, so suppress its unused business rows without changing the IN query.
    const evidenceRoot = { ...nestedRoot, limit: { kind: 'LimitNode', limit: { kind: 'ValueNode', value: 0 } } }
    const nestedQuery = new PostgresQueryCompiler().compileQuery(evidenceRoot as unknown as SelectQueryNode, { queryId: nestedId })
    const wrapped = instrumentAuditRead(nestedQuery, actor, nestedId)
    if (!wrapped) return undefined
    nestedEvidence.push(sql`coalesce((SELECT nested.${sql.id(wrapped.field)} FROM (${source(wrapped.query.query as unknown as Node)}) AS nested
      WHERE nested.${sql.id(wrapped.field)} IS NOT NULL LIMIT 1),'[]'::jsonb)`)
  }
  const transformed = sql`WITH ${attemptsName} AS MATERIALIZED (
      SELECT value AS scope, required FROM (VALUES ${sql.join(attempted.map(attempt => sql`(${attempt.scope},${attempt.required}::boolean)`))}) AS attempted(value,required)
    ), ${businessName} AS MATERIALIZED (
      SELECT original.*, true AS ${marker}, row_number() OVER () AS ${ordinal}
      FROM (${source(businessRoot)}) AS original
    ), ${audienceName} AS MATERIALIZED (
      SELECT CASE WHEN ${predicateLimitExceeded} THEN
          '[ [{"type":"unresolved","reason":"ownership_predicate_limit"}] ]'::jsonb
        WHEN bool_and(NOT required OR scope->>'type' IN ('agency','global')) THEN
          jsonb_agg(jsonb_build_array(scope)) FILTER (WHERE scope->>'type' IN ('agency','global'))
        ELSE coalesce(jsonb_agg(jsonb_build_array(scope)) FILTER (WHERE scope->>'type' IN ('agency','global')), '[]'::jsonb)
          || (SELECT CASE WHEN count(*) > 1000 THEN
              '[ [{"type":"unresolved","reason":"statement_ownership_limit"}] ]'::jsonb
            WHEN count(*) = 0 THEN
              '[ [{"type":"unresolved","reason":"statement_returned_no_ownership"}] ]'::jsonb
            ELSE coalesce(jsonb_agg(candidate.audience), '[]'::jsonb) END
            FROM (${source(candidates)}) AS candidate) END AS ${metadata}
      FROM ${attemptsName}
    ) SELECT ${businessName}.*, CASE WHEN ${businessName}.${ordinal} = 1 OR ${businessName}.${ordinal} IS NULL
        THEN ${audienceName}.${metadata}${nestedEvidence.length ? sql` || ${sql.join(nestedEvidence, sql` || `)}` : sql``}${locking
          ? sql` || (SELECT CASE WHEN count(*) > 1000 THEN
          '[ [{"type":"unresolved","reason":"statement_ownership_limit"}] ]'::jsonb
          ELSE coalesce(jsonb_agg(jsonb_build_array(locked.${sql.id(lockedField)})), '[]'::jsonb) END
          FROM (SELECT ${sql.id(lockedField)} FROM ${businessName} LIMIT 1001) AS locked)`
          : sql``} ELSE NULL END AS ${metadata},
      CASE WHEN ${businessName}.${ordinal} = 1 OR ${businessName}.${ordinal} IS NULL THEN ${metadataTable
        ? sql`jsonb_build_object('table',${`${metadataTable.schema}.${metadataTable.table}`}::text,'excludedColumns',
            (WITH RECURSIVE relations(oid) AS (
              SELECT to_regclass(format('%I.%I',${metadataTable.schema}::text,${metadataTable.table}::text))::oid
              UNION ALL SELECT i.inhrelid FROM pg_inherits i JOIN relations r ON i.inhparent=r.oid
            ), policies AS (
              SELECT p.excluded_columns,coalesce(p.enabled,false) AS enabled FROM relations r
              JOIN pg_class c ON c.oid=r.oid JOIN pg_namespace n ON n.oid=c.relnamespace
              LEFT JOIN audit.capture_policy p ON p.table_schema=n.nspname AND p.table_name=c.relname
            ) SELECT CASE WHEN bool_and(enabled) THEN to_jsonb(coalesce(ARRAY(SELECT DISTINCT value FROM policies p
              CROSS JOIN LATERAL unnest(p.excluded_columns) value WHERE p.enabled ORDER BY value),'{}')) END FROM policies),
            'primaryKey', coalesce((SELECT jsonb_agg(a.attname::text ORDER BY a.attnum)
              FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
              JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=ANY(i.indkey)
              WHERE i.indisprimary AND n.nspname=${metadataTable.schema}::text AND c.relname=${metadataTable.table}::text),'[]'::jsonb))`
        : sql`NULL::jsonb`} ELSE NULL END AS ${statementField}
      FROM ${audienceName} LEFT JOIN ${businessName} ON true
      ORDER BY ${businessName}.${ordinal}`
  const compiled = new PostgresQueryCompiler().compileQuery(transformed.toOperationNode(), { queryId })
  return { query: compiled, field }
}

/** Remove internal evidence and the empty-result sentinel without coercing business values. */
export const extractAuditRead = <R>(rows: R[], field: string): { rows: R[]; scopes: AuditOwnership[]; metadata: AuditStatementMetadata | null } => {
  const scopes: AuditOwnership[] = []
  const clean: R[] = []
  let metadata: AuditStatementMetadata | null = null
  for (const [index, row] of rows.entries()) {
    const values = { ...row } as Record<string, unknown>
    if (index === 0) {
      const evidence = values[field]
      // Attempted alternatives and candidate rows have independent 1,000-item
      // bounds. Four non-locking subqueries add at most 8,000 entries; locking
      // reads carry at most 1,000 actual tuples. SQL emits overflow before combining.
      if (Array.isArray(evidence) && evidence.length <= 11000) scopes.push(...evidence.flat() as AuditOwnership[])
      else scopes.push({ type: 'unresolved', reason: Array.isArray(evidence)
        ? 'statement_ownership_limit'
        : 'statement_ownership_missing' })
      const statement = values[`${field}_statement`]
      if (statement && typeof statement === 'object') metadata = statement as AuditStatementMetadata
    }
    const present = values[`${field}_present`] === true
    Reflect.deleteProperty(values, field)
    Reflect.deleteProperty(values, `${field}_present`)
    Reflect.deleteProperty(values, `${field}_ordinal`)
    Reflect.deleteProperty(values, `${field}_statement`)
    Reflect.deleteProperty(values, `${field}_locked_scope`)
    if (present) clean.push(values as R)
  }
  return { rows: clean, scopes, metadata }
}

/** Change rows alone cannot establish the audience of additional source queries. */
export const isSimpleAuditWrite = (query: CompiledQuery): boolean => {
  const root = node(query.query)!
  const froms = node(root.from)?.froms
  const additionalFrom = root.kind === 'DeleteQueryNode'
    ? !Array.isArray(froms) || froms.length !== 1
    : Boolean(root.from)
  return ['InsertQueryNode', 'UpdateQueryNode', 'DeleteQueryNode'].includes(String(root.kind))
    && !root.with && !additionalFrom && !root.using && !root.joins && !Object.values(root).some(value => unsupported(value, 'write'))
}
