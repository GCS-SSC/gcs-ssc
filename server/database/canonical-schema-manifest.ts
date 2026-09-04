/* eslint-disable jsdoc/require-jsdoc -- Exported manifest types are self-describing data contracts. */
import { citext } from '@electric-sql/pglite/contrib/citext'
import { Kysely, sql } from 'kysely'
import { KyselyPGlite } from 'kysely-pglite'
import type { Database } from '../../shared/types/database'
import { productionCoreMigrations } from './production-core-migrations'

export interface CanonicalSchemaColumn {
  name: string
  position: number
  dataType: string
  nullable: boolean
  defaultExpression: string | null
  identity: 'always' | 'by_default' | null
  generatedExpression: string | null
}

export interface CanonicalSchemaIndex {
  name: string
  columns: string[]
  unique: boolean
  primary: boolean
  method: string
  predicate: string | null
  definition: string
}

export interface CanonicalSchemaUniqueConstraint {
  name: string
  columns: string[]
  primary: boolean
  definition: string
}

export interface CanonicalSchemaCheckConstraint {
  name: string
  columns: string[]
  expression: string
  definition: string
}

export interface CanonicalSchemaForeignKey {
  name: string
  columns: string[]
  referencedSchema: string
  referencedTable: string
  referencedColumns: string[]
  matchType: 'full' | 'partial' | 'simple'
  onUpdate: 'cascade' | 'set_null' | 'set_default' | 'restrict' | 'no_action'
  onDelete: 'cascade' | 'set_null' | 'set_default' | 'restrict' | 'no_action'
  deferrable: boolean
  initiallyDeferred: boolean
  definition: string
}

export interface CanonicalSchemaTable {
  schema: string
  name: string
  columns: CanonicalSchemaColumn[]
  indexes: CanonicalSchemaIndex[]
  uniqueConstraints: CanonicalSchemaUniqueConstraint[]
  checkConstraints: CanonicalSchemaCheckConstraint[]
  foreignKeys: CanonicalSchemaForeignKey[]
}

export interface CanonicalSchemaEnum {
  schema: string
  name: string
  values: string[]
}

export interface CanonicalSchemaFunction {
  schema: string
  name: string
  identityArguments: string
  resultType: string | null
  language: string
  kind: 'function' | 'procedure'
  definition: string
}

export interface CanonicalSchemaTrigger {
  schema: string
  table: string
  name: string
  functionSchema: string
  functionName: string
  enabled: 'origin' | 'replica' | 'always' | 'disabled'
  definition: string
}

export interface CanonicalSchemaManifest {
  schema: string
  tables: CanonicalSchemaTable[]
  enums: CanonicalSchemaEnum[]
  functions: CanonicalSchemaFunction[]
  triggers: CanonicalSchemaTrigger[]
}

interface ColumnRow {
  table_name: string
  column_name: string
  position: number
  data_type: string
  not_null: boolean
  default_expression: string | null
  identity_kind: string
  generated_kind: string
  generated_expression: string | null
}

interface IndexRow {
  table_name: string
  index_name: string
  columns: string[]
  is_unique: boolean
  is_primary: boolean
  method: string
  predicate: string | null
  definition: string
}

interface ConstraintRow {
  table_name: string
  constraint_name: string
  constraint_type: 'c' | 'f' | 'p' | 'u'
  columns: string[]
  referenced_schema: string | null
  referenced_table: string | null
  referenced_columns: string[]
  match_type: string
  update_action: string
  delete_action: string
  is_deferrable: boolean
  initially_deferred: boolean
  expression: string | null
  definition: string
}

interface EnumRow {
  enum_schema: string
  enum_name: string
  values: string[]
}

interface FunctionRow {
  function_schema: string
  function_name: string
  identity_arguments: string
  result_type: string | null
  language: string
  function_kind: 'f' | 'p'
  definition: string
}

interface TriggerRow {
  table_schema: string
  table_name: string
  trigger_name: string
  function_schema: string
  function_name: string
  enabled: string
  definition: string
}

const identityKinds: Record<string, CanonicalSchemaColumn['identity']> = {
  'a': 'always',
  'd': 'by_default',
  '': null
}

const matchTypes: Record<string, CanonicalSchemaForeignKey['matchType']> = {
  f: 'full',
  p: 'partial',
  s: 'simple'
}

const referenceActions: Record<string, CanonicalSchemaForeignKey['onDelete']> = {
  a: 'no_action',
  c: 'cascade',
  d: 'set_default',
  n: 'set_null',
  r: 'restrict'
}

const triggerEnabledValues: Record<string, CanonicalSchemaTrigger['enabled']> = {
  A: 'always',
  D: 'disabled',
  O: 'origin',
  R: 'replica'
}

const compareNames = (left: { name: string }, right: { name: string }): number =>
  left.name.localeCompare(right.name)

const columnsForTable = (rows: ColumnRow[], tableName: string): CanonicalSchemaColumn[] => rows
  .filter(row => row.table_name === tableName)
  .map(row => ({
    name: row.column_name,
    position: Number(row.position),
    dataType: row.data_type,
    nullable: !row.not_null,
    defaultExpression: row.default_expression,
    identity: identityKinds[row.identity_kind] ?? null,
    generatedExpression: row.generated_kind === '' ? null : row.generated_expression
  }))
  .sort((left, right) => left.position - right.position)

const indexesForTable = (rows: IndexRow[], tableName: string): CanonicalSchemaIndex[] => rows
  .filter(row => row.table_name === tableName)
  .map(row => ({
    name: row.index_name,
    columns: row.columns,
    unique: row.is_unique,
    primary: row.is_primary,
    method: row.method,
    predicate: row.predicate,
    definition: row.definition
  }))
  .sort(compareNames)

const uniqueConstraintsForTable = (
  rows: ConstraintRow[],
  tableName: string
): CanonicalSchemaUniqueConstraint[] => rows
  .filter(row => row.table_name === tableName && (row.constraint_type === 'p' || row.constraint_type === 'u'))
  .map(row => ({
    name: row.constraint_name,
    columns: row.columns,
    primary: row.constraint_type === 'p',
    definition: row.definition
  }))
  .sort(compareNames)

const checkConstraintsForTable = (
  rows: ConstraintRow[],
  tableName: string
): CanonicalSchemaCheckConstraint[] => rows
  .filter(row => row.table_name === tableName && row.constraint_type === 'c')
  .map(row => ({
    name: row.constraint_name,
    columns: row.columns,
    expression: row.expression ?? '',
    definition: row.definition
  }))
  .sort(compareNames)

const foreignKeysForTable = (
  rows: ConstraintRow[],
  tableName: string
): CanonicalSchemaForeignKey[] => rows
  .filter(row => row.table_name === tableName && row.constraint_type === 'f')
  .map(row => ({
    name: row.constraint_name,
    columns: row.columns,
    referencedSchema: row.referenced_schema ?? '',
    referencedTable: row.referenced_table ?? '',
    referencedColumns: row.referenced_columns,
    matchType: matchTypes[row.match_type] ?? 'simple',
    onUpdate: referenceActions[row.update_action] ?? 'no_action',
    onDelete: referenceActions[row.delete_action] ?? 'no_action',
    deferrable: row.is_deferrable,
    initiallyDeferred: row.initially_deferred,
    definition: row.definition
  }))
  .sort(compareNames)

/**
 * Extracts a deterministic PostgreSQL schema manifest from runtime catalogs.
 *
 * @param db - Connected PostgreSQL-compatible Kysely instance.
 * @param schemaName - Schema to inspect.
 * @returns Canonical manifest suitable for external reconciliation.
 */
export const extractCanonicalSchemaManifest = async <DatabaseSchema>(
  db: Kysely<DatabaseSchema>,
  schemaName = 'public'
): Promise<CanonicalSchemaManifest> => {
  const [tablesResult, columnsResult, indexesResult, constraintsResult, enumsResult, functionsResult, triggersResult]
    = await Promise.all([
      sql<{ table_name: string }>`
        SELECT relation.relname AS table_name
        FROM pg_catalog.pg_class relation
        INNER JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = ${schemaName}
          AND relation.relkind IN ('r', 'p')
        ORDER BY relation.relname
      `.execute(db),
      sql<ColumnRow>`
        SELECT
          relation.relname AS table_name,
          attribute.attname AS column_name,
          attribute.attnum AS position,
          pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
          attribute.attnotnull AS not_null,
          CASE
            WHEN attribute.attgenerated = ''
              THEN pg_catalog.pg_get_expr(column_default.adbin, column_default.adrelid)
            ELSE NULL
          END AS default_expression,
          attribute.attidentity AS identity_kind,
          attribute.attgenerated AS generated_kind,
          CASE
            WHEN attribute.attgenerated <> ''
              THEN pg_catalog.pg_get_expr(column_default.adbin, column_default.adrelid)
            ELSE NULL
          END AS generated_expression
        FROM pg_catalog.pg_attribute attribute
        INNER JOIN pg_catalog.pg_class relation ON relation.oid = attribute.attrelid
        INNER JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
        LEFT JOIN pg_catalog.pg_attrdef column_default
          ON column_default.adrelid = relation.oid
          AND column_default.adnum = attribute.attnum
        WHERE namespace.nspname = ${schemaName}
          AND relation.relkind IN ('r', 'p')
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
        ORDER BY relation.relname, attribute.attnum
      `.execute(db),
      sql<IndexRow>`
        SELECT
          table_relation.relname AS table_name,
          index_relation.relname AS index_name,
          COALESCE((
            SELECT array_agg(attribute.attname ORDER BY index_column.ordinality)
            FROM unnest(index_metadata.indkey) WITH ORDINALITY AS index_column(attribute_number, ordinality)
            INNER JOIN pg_catalog.pg_attribute attribute
              ON attribute.attrelid = table_relation.oid
              AND attribute.attnum = index_column.attribute_number
            WHERE index_column.attribute_number > 0
          ), ARRAY[]::text[]) AS columns,
          index_metadata.indisunique AS is_unique,
          index_metadata.indisprimary AS is_primary,
          access_method.amname AS method,
          pg_catalog.pg_get_expr(index_metadata.indpred, index_metadata.indrelid) AS predicate,
          pg_catalog.pg_get_indexdef(index_metadata.indexrelid) AS definition
        FROM pg_catalog.pg_index index_metadata
        INNER JOIN pg_catalog.pg_class table_relation ON table_relation.oid = index_metadata.indrelid
        INNER JOIN pg_catalog.pg_namespace namespace ON namespace.oid = table_relation.relnamespace
        INNER JOIN pg_catalog.pg_class index_relation ON index_relation.oid = index_metadata.indexrelid
        INNER JOIN pg_catalog.pg_am access_method ON access_method.oid = index_relation.relam
        WHERE namespace.nspname = ${schemaName}
          AND table_relation.relkind IN ('r', 'p')
        ORDER BY table_relation.relname, index_relation.relname
      `.execute(db),
      sql<ConstraintRow>`
        SELECT
          table_relation.relname AS table_name,
          constraint_record.conname AS constraint_name,
          constraint_record.contype AS constraint_type,
          COALESCE((
            SELECT array_agg(attribute.attname ORDER BY constrained_column.ordinality)
            FROM unnest(constraint_record.conkey) WITH ORDINALITY AS constrained_column(attribute_number, ordinality)
            INNER JOIN pg_catalog.pg_attribute attribute
              ON attribute.attrelid = table_relation.oid
              AND attribute.attnum = constrained_column.attribute_number
          ), ARRAY[]::text[]) AS columns,
          referenced_namespace.nspname AS referenced_schema,
          referenced_relation.relname AS referenced_table,
          COALESCE((
            SELECT array_agg(attribute.attname ORDER BY referenced_column.ordinality)
            FROM unnest(constraint_record.confkey) WITH ORDINALITY AS referenced_column(attribute_number, ordinality)
            INNER JOIN pg_catalog.pg_attribute attribute
              ON attribute.attrelid = referenced_relation.oid
              AND attribute.attnum = referenced_column.attribute_number
          ), ARRAY[]::text[]) AS referenced_columns,
          constraint_record.confmatchtype AS match_type,
          constraint_record.confupdtype AS update_action,
          constraint_record.confdeltype AS delete_action,
          constraint_record.condeferrable AS is_deferrable,
          constraint_record.condeferred AS initially_deferred,
          CASE
            WHEN constraint_record.contype = 'c'
              THEN pg_catalog.pg_get_expr(constraint_record.conbin, constraint_record.conrelid)
            ELSE NULL
          END AS expression,
          pg_catalog.pg_get_constraintdef(constraint_record.oid, true) AS definition
        FROM pg_catalog.pg_constraint constraint_record
        INNER JOIN pg_catalog.pg_class table_relation ON table_relation.oid = constraint_record.conrelid
        INNER JOIN pg_catalog.pg_namespace namespace ON namespace.oid = table_relation.relnamespace
        LEFT JOIN pg_catalog.pg_class referenced_relation ON referenced_relation.oid = constraint_record.confrelid
        LEFT JOIN pg_catalog.pg_namespace referenced_namespace
          ON referenced_namespace.oid = referenced_relation.relnamespace
        WHERE namespace.nspname = ${schemaName}
          AND table_relation.relkind IN ('r', 'p')
          AND constraint_record.contype IN ('c', 'f', 'p', 'u')
        ORDER BY table_relation.relname, constraint_record.conname
      `.execute(db),
      sql<EnumRow>`
        SELECT
          namespace.nspname AS enum_schema,
          enum_type.typname AS enum_name,
          array_agg(enum_value.enumlabel ORDER BY enum_value.enumsortorder) AS values
        FROM pg_catalog.pg_type enum_type
        INNER JOIN pg_catalog.pg_namespace namespace ON namespace.oid = enum_type.typnamespace
        INNER JOIN pg_catalog.pg_enum enum_value ON enum_value.enumtypid = enum_type.oid
        WHERE namespace.nspname = ${schemaName}
        GROUP BY namespace.nspname, enum_type.typname
        ORDER BY enum_type.typname
      `.execute(db),
      sql<FunctionRow>`
        SELECT
          namespace.nspname AS function_schema,
          procedure_record.proname AS function_name,
          pg_catalog.pg_get_function_identity_arguments(procedure_record.oid) AS identity_arguments,
          pg_catalog.pg_get_function_result(procedure_record.oid) AS result_type,
          language.lanname AS language,
          procedure_record.prokind AS function_kind,
          pg_catalog.pg_get_functiondef(procedure_record.oid) AS definition
        FROM pg_catalog.pg_proc procedure_record
        INNER JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure_record.pronamespace
        INNER JOIN pg_catalog.pg_language language ON language.oid = procedure_record.prolang
        WHERE namespace.nspname = ${schemaName}
          AND procedure_record.prokind IN ('f', 'p')
          AND NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_depend dependency
            INNER JOIN pg_catalog.pg_extension extension_record
              ON extension_record.oid = dependency.refobjid
            WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
              AND dependency.objid = procedure_record.oid
              AND dependency.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass
              AND dependency.deptype = 'e'
          )
        ORDER BY procedure_record.proname, pg_catalog.pg_get_function_identity_arguments(procedure_record.oid)
      `.execute(db),
      sql<TriggerRow>`
        SELECT
          namespace.nspname AS table_schema,
          table_relation.relname AS table_name,
          trigger_record.tgname AS trigger_name,
          function_namespace.nspname AS function_schema,
          procedure_record.proname AS function_name,
          trigger_record.tgenabled AS enabled,
          pg_catalog.pg_get_triggerdef(trigger_record.oid, true) AS definition
        FROM pg_catalog.pg_trigger trigger_record
        INNER JOIN pg_catalog.pg_class table_relation ON table_relation.oid = trigger_record.tgrelid
        INNER JOIN pg_catalog.pg_namespace namespace ON namespace.oid = table_relation.relnamespace
        INNER JOIN pg_catalog.pg_proc procedure_record ON procedure_record.oid = trigger_record.tgfoid
        INNER JOIN pg_catalog.pg_namespace function_namespace
          ON function_namespace.oid = procedure_record.pronamespace
        WHERE namespace.nspname = ${schemaName}
          AND NOT trigger_record.tgisinternal
        ORDER BY table_relation.relname, trigger_record.tgname
      `.execute(db)
    ])

  const tables = tablesResult.rows.map(({ table_name: tableName }) => ({
    schema: schemaName,
    name: tableName,
    columns: columnsForTable(columnsResult.rows, tableName),
    indexes: indexesForTable(indexesResult.rows, tableName),
    uniqueConstraints: uniqueConstraintsForTable(constraintsResult.rows, tableName),
    checkConstraints: checkConstraintsForTable(constraintsResult.rows, tableName),
    foreignKeys: foreignKeysForTable(constraintsResult.rows, tableName)
  }))

  return {
    schema: schemaName,
    tables,
    enums: enumsResult.rows.map(row => ({
      schema: row.enum_schema,
      name: row.enum_name,
      values: row.values
    })),
    functions: functionsResult.rows.map(row => ({
      schema: row.function_schema,
      name: row.function_name,
      identityArguments: row.identity_arguments,
      resultType: row.result_type,
      language: row.language,
      kind: row.function_kind === 'p' ? 'procedure' : 'function',
      definition: row.definition
    })),
    triggers: triggersResult.rows.map(row => ({
      schema: row.table_schema,
      table: row.table_name,
      name: row.trigger_name,
      functionSchema: row.function_schema,
      functionName: row.function_name,
      enabled: triggerEnabledValues[row.enabled] ?? 'origin',
      definition: row.definition
    }))
  }
}

/**
 * Builds the canonical production-core manifest from a fresh in-memory PGlite database.
 *
 * @returns Runtime schema produced by the ordered production migrations.
 */
export const createProductionCoreSchemaManifest = async (): Promise<CanonicalSchemaManifest> => {
  const pglite = await KyselyPGlite.create('memory://', { extensions: { citext } })
  const db = new Kysely<Database>({ dialect: pglite.dialect })
  try {
    for (const migration of Object.values(productionCoreMigrations)) {
      await migration.up(db)
    }
    return await extractCanonicalSchemaManifest(db)
  } finally {
    await db.destroy()
  }
}
