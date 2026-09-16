/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Validation reports explicit registry/schema mismatches. */
import { AUDIT_ENTITY_TABLES, AUDIT_TABLE_OWNERSHIP, type AuditOwnershipRule } from './audit-ownership-registry'

export type AuditOwnershipSchemaTable = {
  schema: string
  name: string
  columns: readonly { name: string }[]
}

/** Checks installed tables, including extensions; no wildcard allows a new table to bypass registration. */
export const auditOwnershipRegistrationIssues = (
  tables: readonly AuditOwnershipSchemaTable[],
  registry: Readonly<Record<string, AuditOwnershipRule>> = AUDIT_TABLE_OWNERSHIP
): string[] => {
  const issues: string[] = []
  const installed = new Map(tables.map(table => [`${table.schema}.${table.name}`, new Set(table.columns.map(column => column.name))]))
  const checkRule = (table: string, rule: AuditOwnershipRule, path: readonly string[]): void => {
    const columns = installed.get(table)
    const checkColumn = (column: string) => {
      if (columns && !columns.has(column)) issues.push(`${table}: missing ownership column ${column}`)
    }
    const checkParent = (target: string) => {
      if (!registry[target]) issues.push(`${table}: unregistered owner ${target}`)
      else if (!installed.has(target)) issues.push(`${table}: owner table not installed ${target}`)
      else if (path.includes(target)) issues.push(`${table}: ownership cycle through ${target}`)
      else checkRule(target, registry[target], [...path, target])
    }
    switch (rule.kind) {
      case 'stored-audience':
        checkColumn('scope_type')
        checkColumn('agency_ids')
        break
      case 'global':
        if (!rule.reason.trim()) issues.push(`${table}: global classification needs a reason`)
        break
      case 'agency':
        checkColumn(rule.column)
        break
      case 'actor-agencies': break
      case 'parent':
        checkColumn(rule.column)
        if (installed.has(rule.table) && !installed.get(rule.table)!.has(rule.targetColumn)) {
          issues.push(`${table}: owner key missing ${rule.table}.${rule.targetColumn}`)
        }
        checkParent(rule.table)
        break
      case 'encoded-entity':
        checkColumn(rule.column)
        checkColumn(rule.dimensionColumn)
        break
      case 'entity':
        checkColumn(rule.idColumn)
        checkColumn(rule.typeColumn)
        // Entity recursion depends on row values; the runtime resolver also detects cycles.
        for (const target of Object.values(AUDIT_ENTITY_TABLES)) {
          if (!registry[target]) issues.push(`${table}: unregistered typed owner ${target}`)
        }
        break
      case 'switch':
        checkColumn(rule.column)
        if (!Object.keys(rule.cases).length) issues.push(`${table}: empty ownership variants`)
        for (const variant of Object.values(rule.cases)) checkRule(table, variant, path)
        break
      case 'references':
        checkColumn('id')
        for (const link of rule.links) {
          if (installed.has(link.table) && !installed.get(link.table)!.has(link.column)) {
            issues.push(`${table}: reverse owner key missing ${link.table}.${link.column}`)
          }
          checkParent(link.table)
        }
        break
      case 'first':
        if (!rule.rules.length) issues.push(`${table}: empty ownership alternatives`)
        for (const alternative of rule.rules) checkRule(table, alternative, path)
        break
    }
  }
  for (const table of installed.keys()) {
    const rule = registry[table]
    if (!rule && !table.startsWith('extensions.')) issues.push(`${table}: ownership registration required`)
    else if (rule) checkRule(table, rule, [table])
  }
  return [...new Set(issues)].sort()
}
