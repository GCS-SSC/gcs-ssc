/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Artifact smoke internals are documented at their verification boundaries and exported entry points. */
import assert from 'node:assert/strict'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { createServer as createHttpServer, get as httpGet } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { citext } from '@electric-sql/pglite/contrib/citext'
import { chromium } from 'playwright'
import {
  buildOutputPayloads,
  buildWebContainerPayloadBundle
} from './webcontainer'

interface SerializedManifest {
  files: Array<{
    file: string
    mountPoint: string
  }>
}

interface SerializedFileNode {
  file: {
    contents: string
    encoding?: 'base64'
  }
}

interface SerializedDirectoryNode {
  directory: Record<string, SerializedTreeNode>
}

type SerializedTreeNode = SerializedFileNode | SerializedDirectoryNode
type SerializedTree = Record<string, SerializedTreeNode>

const ESSENTIAL_CHILD_ENVIRONMENT_VARIABLES = [
  'ComSpec',
  'PATH',
  'PATHEXT',
  'Path',
  'SYSTEMROOT',
  'SystemRoot',
  'TEMP',
  'TMP',
  'TMPDIR',
  'WINDIR'
] as const

const EXPECTED_CORE_MIGRATIONS = [
  '0001_common',
  '0002_users',
  '0003_rbac',
  '0004_agency',
  '0005_common_agency',
  '0006_transfer_payment',
  '0007_polymorphic_common_tp',
  '0008_applicant_recipient',
  '0009_funding_case_agreement',
  '0010_extensions',
  '0011_storage_cleanup_outbox',
  '0012_recommendation_revision',
  '9999_seed'
] as const

const EXPECTED_SEEDED_EXTENSION_KEYS = [
  'gcs-automated-payments',
  'gcs-gcforms-integration',
  'gcs-narrative-quality',
  'gcs-narrative-tags',
  'gcs-outcome-cost-allocation',
  'gcs-storage-local'
] as const

const EXPECTED_PACKAGED_STORAGE_PROVIDER_KEYS = [
  'gcs-storage-local',
  'gcs-storage-s3'
] as const

interface MigrationRow {
  name: string
}

interface ExtensionEnablementRow {
  extension_key: string
}

export interface RuntimeExtensionDefinition {
  key: string
  migrations: Array<{
    key: string
  }>
}

interface CanonicalColumnRow {
  column_default: string | null
  column_name: string
  data_type: string
  is_nullable: string
  table_schema: string
  table_name: string
}

interface CanonicalIndexRow {
  index_schema: string
  indexname: string
  is_unique: boolean
  key_expressions: string[]
  predicate: string | null
  table_schema: string
  table_name: string
}

export interface CanonicalIndexExpectation {
  indexName: string
  keyExpressions: string[]
  predicate: RegExp
  tableName: string
  tableSchema: string
  unique: boolean
}

interface StopProcessOptions {
  killTimeoutMs?: number
  termTimeoutMs?: number
}

/**
 * Creates the isolated runtime environment for the reconstructed Nitro server.
 *
 * @param port - Loopback port reserved for the smoke.
 * @param pgliteDataDirectory - Smoke-owned PGlite storage path.
 * @param sourceEnvironment - Host environment to sanitize.
 * @param storageDirectory - Smoke-owned local file storage path.
 * @returns Runtime environment without inherited database or URL configuration.
 */
export const buildWebContainerSmokeEnvironment = (
  port: number,
  pgliteDataDirectory: string,
  sourceEnvironment: NodeJS.ProcessEnv = process.env,
  storageDirectory = path.join(path.dirname(pgliteDataDirectory), 'storage')
): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {}
  for (const variableName of ESSENTIAL_CHILD_ENVIRONMENT_VARIABLES) {
    const value = sourceEnvironment[variableName]
    if (value !== undefined) {
      environment[variableName] = value
    }
  }

  return {
    ...environment,
    BETTER_AUTH_SECRET: 'webcontainer-artifact-smoke-secret',
    GCS_DEMO_MIGRATION_SUFFIX: 'seed',
    GCS_LOCAL_FILE_STORAGE_DIR: storageDirectory,
    GCS_RUNTIME_MIGRATION_MODE: 'webcontainer-demo',
    NITRO_HOST: '127.0.0.1',
    NITRO_PORT: String(port),
    NODE_ENV: 'production',
    PGLITE_DATA_DIR: pgliteDataDirectory
  }
}

const isSerializedManifest = (value: unknown): value is SerializedManifest => {
  if (!value || typeof value !== 'object' || !('files' in value) || !Array.isArray(value.files)) {
    return false
  }

  return value.files.every(entry =>
    Boolean(entry)
    && typeof entry === 'object'
    && 'file' in entry
    && typeof entry.file === 'string'
    && 'mountPoint' in entry
    && typeof entry.mountPoint === 'string'
  )
}

const isRuntimeExtensionDefinition = (value: unknown): value is RuntimeExtensionDefinition => {
  if (
    !value
    || typeof value !== 'object'
    || !('key' in value)
    || typeof value.key !== 'string'
    || !('migrations' in value)
    || !Array.isArray(value.migrations)
  ) {
    return false
  }

  return value.migrations.every(migration =>
    Boolean(migration)
    && typeof migration === 'object'
    && 'key' in migration
    && typeof migration.key === 'string'
  )
}

/** Extracts one balanced JSON array while respecting JSON string escapes. */
const extractJsonArrayAfterMarker = (
  contents: string,
  marker: string
): string | null => {
  const markerIndex = contents.indexOf(marker)
  if (markerIndex === -1) {
    return null
  }

  const arrayStart = contents.indexOf('[', markerIndex + marker.length)
  if (arrayStart === -1) {
    return null
  }

  let depth = 0
  let escaped = false
  let inString = false
  for (let index = arrayStart; index < contents.length; index += 1) {
    const character = contents[index]
    if (character === undefined) continue

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }

    if (character === '"') {
      inString = true
    } else if (character === '[') {
      depth += 1
    } else if (character === ']') {
      depth -= 1
      if (depth === 0) {
        return contents.slice(arrayStart, index + 1)
      }
    }
  }

  return null
}

const readMjsFiles = async (directoryPath: string): Promise<string[]> => {
  const files: string[] = []
  const entries = (await fs.readdir(directoryPath, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...await readMjsFiles(entryPath))
    } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
      files.push(entryPath)
    }
  }

  return files
}

/**
 * Reads exact migration keys from the build-generated extension registry.
 *
 * @param reconstructedRoot - Source-free root containing the materialized output.
 * @returns Runtime extension definitions bundled into Nitro.
 */
export const readRuntimeExtensionDefinitions = async (
  reconstructedRoot: string
): Promise<RuntimeExtensionDefinition[]> => {
  const chunksDirectory = path.join(reconstructedRoot, '.output', 'server', 'chunks')
  for (const filePath of await readMjsFiles(chunksDirectory)) {
    const contents = await fs.readFile(filePath, 'utf-8')
    const serializedRegistry = extractJsonArrayAfterMarker(
      contents,
      'const gcsExtensions ='
    )
    if (serializedRegistry === null) continue

    const value: unknown = JSON.parse(serializedRegistry)
    assert(
      Array.isArray(value) && value.every(isRuntimeExtensionDefinition),
      'WebContainer runtime extension registry is invalid.'
    )
    return value
  }

  throw new Error('WebContainer runtime extension registry was not found in the serialized artifact.')
}

/** Writes a decoded WebContainer tree without relying on the source artifact. */
const materializeTree = async (
  targetDirectory: string,
  tree: SerializedTree
): Promise<void> => {
  await fs.mkdir(targetDirectory, { recursive: true })

  for (const [entryName, node] of Object.entries(tree)) {
    const targetPath = path.join(targetDirectory, entryName)
    if ('directory' in node) {
      await materializeTree(targetPath, node.directory)
      continue
    }

    const contents = node.file.encoding === 'base64'
      ? Buffer.from(node.file.contents, 'base64')
      : node.file.contents
    await fs.writeFile(targetPath, contents)
  }
}

/** Reserves an available loopback port for the reconstructed Nitro smoke. */
const findAvailablePort = async (): Promise<number> => {
  const server = createNetServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert(address && typeof address === 'object')
  const port = address.port
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })
  return port
}

/** Returns whether the reconstructed server serves a successful JSON runtime probe. */
const httpRuntimeProbeSucceeded = async (url: string): Promise<boolean> => {
  return await new Promise<boolean>((resolve) => {
    const request = httpGet(url, response => {
      let body = ''
      response.setEncoding('utf-8')
      response.on('data', chunk => {
        body += chunk
      })
      response.once('end', () => {
        if (
          response.statusCode !== 200
          || !response.headers['content-type']?.includes('application/json')
        ) {
          resolve(false)
          return
        }

        try {
          JSON.parse(body)
          resolve(true)
        } catch {
          resolve(false)
        }
      })
    })
    request.once('error', () => resolve(false))
    request.setTimeout(1_000, () => {
      request.destroy()
      resolve(false)
    })
  })
}

const MIGRATION_FAILURE_MARKERS = [
  'failed to execute extension migration',
  'failed to migrate enabled extensions',
  'failed to execute migration',
  'failed to migrate'
] as const

/**
 * Fails when Nitro emitted any core or extension migration failure marker.
 *
 * @param output - Complete reconstructed-server output.
 */
export const assertNoMigrationFailureOutput = (output: string): void => {
  const failureMarker = MIGRATION_FAILURE_MARKERS.find(marker => output.includes(marker))
  if (failureMarker !== undefined) {
    throw new Error(
      `Reconstructed Nitro reported migration failure marker "${failureMarker}".\n${output}`
    )
  }
}

/** Waits for Nitro to serve HTTP or fail with diagnostic process output. */
const waitForNitro = async (
  child: ChildProcessWithoutNullStreams,
  url: string,
  getOutput: () => string
): Promise<void> => {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    assertNoMigrationFailureOutput(getOutput())
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Reconstructed Nitro exited before serving HTTP.\n${getOutput()}`)
    }
    if (await httpRuntimeProbeSucceeded(url)) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for reconstructed Nitro at ${url}.\n${getOutput()}`)
}

/** Waits until the startup migration plugin reports core success. */
const waitForCoreMigrationResult = async (
  child: ChildProcessWithoutNullStreams,
  getOutput: () => string
): Promise<void> => {
  const successMarker = 'migration "9999_seed" was executed successfully'
  const deadline = Date.now() + 30_000

  while (Date.now() < deadline) {
    const output = getOutput()
    assertNoMigrationFailureOutput(output)
    if (output.includes(successMarker)) {
      return
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Reconstructed Nitro exited before migrations completed.\n${output}`)
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  throw new Error(`Timed out waiting for reconstructed Nitro migrations.\n${getOutput()}`)
}

/**
 * Waits for a child after registering the exit listener before any signal is sent.
 *
 * @param child - Reconstructed Nitro child process.
 * @param timeoutMs - Maximum time to wait for this shutdown stage.
 * @returns Whether the child was confirmed stopped.
 */
const waitForProcessExit = async (
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number
): Promise<boolean> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true
  }

  return await new Promise<boolean>(resolve => {
    let settled = false
    const finish = (didExit: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      child.removeListener('exit', onExit)
      resolve(didExit)
    }
    const onExit = () => finish(true)
    const timeout = setTimeout(() => finish(false), timeoutMs)

    child.once('exit', onExit)
    if (child.exitCode !== null || child.signalCode !== null) {
      finish(true)
    }
  })
}

/**
 * Stops reconstructed Nitro with a race-safe TERM-to-KILL escalation.
 *
 * @param child - Reconstructed Nitro child process.
 * @param options - Per-stage shutdown deadlines.
 */
export const stopProcess = async (
  child: ChildProcessWithoutNullStreams,
  options: StopProcessOptions = {}
): Promise<void> => {
  const {
    killTimeoutMs = 5_000,
    termTimeoutMs = 5_000
  } = options

  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }

  const termExit = waitForProcessExit(child, termTimeoutMs)
  child.kill('SIGTERM')
  if (await termExit) {
    return
  }

  const killExit = waitForProcessExit(child, killTimeoutMs)
  child.kill('SIGKILL')
  if (!(await killExit)) {
    throw new Error('Reconstructed Nitro remained alive after SIGTERM and SIGKILL.')
  }
}

const extensionMigrationTableSuffix = (extensionKey: string): string => {
  const sanitizedPrefix = extensionKey.replaceAll('-', '_').replace(/[^a-z0-9_]/g, '').slice(0, 28)
  const hash = createHash('sha256').update(extensionKey).digest('hex').slice(0, 8)
  return `${sanitizedPrefix}_${hash}`
}

const queryCanonicalColumns = async (
  pg: PGlite,
  tableSchema: string,
  tableName: string,
  columnNames: string[]
): Promise<CanonicalColumnRow[]> => {
  const result = await pg.query<CanonicalColumnRow>(`
    select table_schema, table_name, column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where
      table_schema = $1
      and table_name = $2
      and column_name = any($3::text[])
    order by column_name
  `, [tableSchema, tableName, columnNames])
  return result.rows
}

/** Reads one exact index definition from PostgreSQL catalog metadata. */
const queryCanonicalIndex = async (
  pg: PGlite,
  tableSchema: string,
  tableName: string,
  indexName: string
): Promise<CanonicalIndexRow[]> => {
  const result = await pg.query<CanonicalIndexRow>(`
    select
      indexed_namespace.nspname as table_schema,
      indexed_table.relname as table_name,
      index_namespace.nspname as index_schema,
      index_relation.relname as indexname,
      index_metadata.indisunique as is_unique,
      array(
        select pg_get_indexdef(index_metadata.indexrelid, key_position, true)
        from generate_series(1, index_metadata.indnkeyatts) as positions(key_position)
        order by key_position
      ) as key_expressions,
      pg_get_expr(index_metadata.indpred, index_metadata.indrelid) as predicate
    from pg_index index_metadata
    join pg_class index_relation on index_relation.oid = index_metadata.indexrelid
    join pg_namespace index_namespace on index_namespace.oid = index_relation.relnamespace
    join pg_class indexed_table on indexed_table.oid = index_metadata.indrelid
    join pg_namespace indexed_namespace on indexed_namespace.oid = indexed_table.relnamespace
    where
      indexed_namespace.nspname = $1
      and indexed_table.relname = $2
      and index_relation.relname = $3
  `, [tableSchema, tableName, indexName])
  return result.rows
}

/**
 * Verifies the owner, uniqueness, ordered keys/expressions, and predicate of one index.
 */
export const assertCanonicalIndex = async (
  pg: PGlite,
  expectation: CanonicalIndexExpectation
): Promise<void> => {
  const indexes = await queryCanonicalIndex(
    pg,
    expectation.tableSchema,
    expectation.tableName,
    expectation.indexName
  )
  assert.equal(
    indexes.length,
    1,
    `WebContainer canonical index "${expectation.indexName}" was missing or ambiguous.`
  )
  const index = indexes[0]
  assert(index, `WebContainer canonical index "${expectation.indexName}" was not returned.`)
  assert.deepEqual({
    index_schema: index.index_schema,
    indexname: index.indexname,
    is_unique: index.is_unique,
    key_expressions: index.key_expressions,
    table_schema: index.table_schema,
    table_name: index.table_name
  }, {
    index_schema: expectation.tableSchema,
    indexname: expectation.indexName,
    is_unique: expectation.unique,
    key_expressions: expectation.keyExpressions,
    table_schema: expectation.tableSchema,
    table_name: expectation.tableName
  }, `WebContainer canonical index "${expectation.indexName}" metadata invariant failed.`)
  assert.match(
    index.predicate ?? '',
    expectation.predicate,
    `WebContainer canonical index "${expectation.indexName}" predicate invariant failed.`
  )
}

/** Verifies stable schema objects owned by the enabled GCForms extension. */
const verifyGcFormsSchema = async (pg: PGlite): Promise<void> => {
  assert.deepEqual(
    await queryCanonicalColumns(
      pg,
      'extensions',
      'gcs_gcforms_credentials',
      ['_deleted']
    ),
    [{
      table_schema: 'extensions',
      table_name: 'gcs_gcforms_credentials',
      column_name: '_deleted',
      data_type: 'boolean',
      is_nullable: 'NO',
      column_default: 'false'
    }],
    'WebContainer GCForms canonical credentials column invariant failed.'
  )

  await assertCanonicalIndex(pg, {
    tableSchema: 'public',
    tableName: 'Funding_Case_Agreement_Claim',
    indexName: 'fc_idx_claim_gcforms_submission_uuid',
    unique: true,
    keyExpressions: ['egcs_fc_gcformssubmissionuuid'],
    predicate: /_deleted.*false.*egcs_fc_gcformssubmissionuuid.*IS NOT NULL/i
  })
}

const EXTENSION_SCHEMA_VERIFIERS: Record<string, (pg: PGlite) => Promise<void>> = {
  'gcs-gcforms-integration': verifyGcFormsSchema
}

/**
 * Verifies exact core and enabled-extension migrations plus canonical schema metadata.
 *
 * @param pgliteDataDirectory - Stopped smoke database directory.
 * @param runtimeExtensions - Exact extension registry recovered from the artifact.
 */
export const verifyWebContainerDatabase = async (
  pgliteDataDirectory: string,
  runtimeExtensions: RuntimeExtensionDefinition[]
): Promise<void> => {
  const pg = new PGlite(pgliteDataDirectory, {
    extensions: { citext }
  })

  try {
    let migrations
    try {
      migrations = await pg.query<MigrationRow>(
        'select name from public.kysely_migration order by timestamp, name'
      )
    } catch (error) {
      throw new Error('WebContainer migration journal invariant failed.', { cause: error })
    }
    assert.deepEqual(
      migrations.rows.map(row => row.name),
      [...EXPECTED_CORE_MIGRATIONS],
      'WebContainer migration journal did not contain the exact core migration set.'
    )

    const columns = await pg.query<CanonicalColumnRow>(`
      select table_schema, table_name, column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where
        table_schema = 'public'
        and table_name = 'role'
        and column_name = '_deleted'
    `)
    assert.deepEqual(columns.rows, [{
      table_schema: 'public',
      table_name: 'role',
      column_name: '_deleted',
      data_type: 'boolean',
      is_nullable: 'NO',
      column_default: 'false'
    }], 'WebContainer canonical role._deleted column invariant failed.')

    await assertCanonicalIndex(pg, {
      tableSchema: 'public',
      tableName: 'user_role_assignment',
      indexName: 'user_role_assignment_unique_active',
      unique: true,
      keyExpressions: ['user_id', 'role_id'],
      predicate: /_deleted = false/i
    })

    const enabledExtensions = await pg.query<ExtensionEnablementRow>(`
      select distinct extension_key
      from extensions.agency_enablement
      where enabled = true and _deleted = false
      order by extension_key
    `)
    assert.deepEqual(
      enabledExtensions.rows.map(row => row.extension_key),
      [...EXPECTED_SEEDED_EXTENSION_KEYS],
      'WebContainer enabled extension set did not match the production seed.'
    )
    const runtimeExtensionMap = new Map(
      runtimeExtensions.map(extension => [extension.key, extension])
    )
    for (const providerKey of EXPECTED_PACKAGED_STORAGE_PROVIDER_KEYS) {
      assert(
        runtimeExtensionMap.has(providerKey),
        `Packaged storage provider "${providerKey}" was absent from the WebContainer runtime registry.`
      )
    }

    for (const enabledExtension of enabledExtensions.rows) {
      const extension = runtimeExtensionMap.get(enabledExtension.extension_key)
      assert(
        extension !== undefined,
        `Enabled extension "${enabledExtension.extension_key}" was absent from the artifact runtime registry.`
      )

      if (extension.migrations.length > 0) {
        const tableSuffix = extensionMigrationTableSuffix(extension.key)
        const journalTable = `extension_migration_${tableSuffix}`
        let extensionMigrations
        try {
          extensionMigrations = await pg.query<MigrationRow>(
            `select name from extensions."${journalTable}" order by timestamp, name`
          )
        } catch (error) {
          throw new Error(
            `WebContainer extension migration journal invariant failed for "${extension.key}".`,
            { cause: error }
          )
        }
        assert.deepEqual(
          extensionMigrations.rows.map(row => row.name),
          extension.migrations.map(migration => migration.key),
          `WebContainer extension migration journal did not contain the exact migration set for "${extension.key}".`
        )
      }

      const verifySchema = EXTENSION_SCHEMA_VERIFIERS[extension.key]
      if (verifySchema) await verifySchema(pg)
    }
  } finally {
    await pg.close()
  }
}

const WEB_CONTAINER_BROWSER_MOCK = `
const state = {
  mounts: [],
  spawn: null
};
globalThis.__GCS_WEB_CONTAINER_MOCK__ = state;

const summarizeTree = (tree) => {
  const paths = [];
  let binaryFiles = 0;
  const visit = (node, currentPath) => {
    if (node && node.directory) {
      for (const [entryName, child] of Object.entries(node.directory)) {
        visit(child, currentPath ? currentPath + '/' + entryName : entryName);
      }
      return;
    }
    if (node && node.file) {
      paths.push(currentPath);
      if (node.file.contents instanceof Uint8Array) binaryFiles += 1;
    }
  };
  for (const [entryName, node] of Object.entries(tree)) visit(node, entryName);
  return { binaryFiles, paths };
};

export const WebContainer = {
  boot: async () => {
    const listeners = new Map();
    return {
      mount: async tree => {
        state.mounts.push(summarizeTree(tree));
      },
      on: (eventName, listener) => {
        listeners.set(eventName, listener);
      },
      spawn: async (command, args, options) => {
        state.spawn = { command, args, options };
        setTimeout(() => listeners.get('server-ready')?.(3000, 'https://preview.invalid/'), 0);
        return {
          output: new ReadableStream({
            start(controller) {
              controller.enqueue('MOCK_WEB_CONTAINER_PROCESS_READY');
              controller.close();
            }
          })
        };
      }
    };
  }
};
`

const previewContentType = (filePath: string): string => {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8'
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8'
  return 'application/octet-stream'
}

/**
 * Executes the generated browser wrapper with a mocked WebContainer runtime.
 *
 * The browser still fetches and validates the real manifest/shards, decodes
 * binary nodes, wraps every mount point, and exercises spawn/server-ready UI.
 */
export const testGeneratedWebContainerPreview = async (
  previewDirectory = 'webcontainer-preview'
): Promise<void> => {
  const previewPath = path.resolve(previewDirectory)
  const previewEntries = (await fs.readdir(previewPath)).sort()
  const manifestFiles = previewEntries.filter(file =>
    /^files\.[a-f0-9]{12}\.manifest\.json$/.test(file)
  )
  assert.equal(
    manifestFiles.length,
    1,
    'Generated WebContainer preview must contain exactly one current manifest.'
  )
  const manifestFile = manifestFiles[0]
  assert(manifestFile, 'Generated WebContainer preview manifest was not found.')
  const manifestValue: unknown = JSON.parse(
    await fs.readFile(path.join(previewPath, manifestFile), 'utf-8')
  )
  assert(isSerializedManifest(manifestValue), 'Generated WebContainer preview manifest is invalid.')
  assert(manifestValue.files.length > 1, 'Generated WebContainer preview did not exercise multi-mount loading.')

  const currentPayloadFiles = new Set([
    manifestFile,
    ...manifestValue.files.map(entry => entry.file)
  ])
  const generatedDataFiles = previewEntries.filter(file => /^files\..*\.json$/.test(file))
  assert.deepEqual(
    generatedDataFiles,
    [...currentPayloadFiles].sort(),
    'Generated WebContainer preview retained stale manifest or shard files.'
  )

  const requestedPreviewPaths = new Set<string>()
  const server = createHttpServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
      const relativePath = requestUrl.pathname === '/'
        ? 'index.html'
        : decodeURIComponent(requestUrl.pathname.slice(1))
      if (
        relativePath.length === 0
        || relativePath.includes('\\')
        || relativePath.split('/').some(segment => segment === '..')
      ) {
        response.writeHead(400)
        response.end('unsafe path')
        return
      }
      const filePath = path.resolve(previewPath, relativePath)
      const relativeFilePath = path.relative(previewPath, filePath)
      if (
        relativeFilePath === '..'
        || relativeFilePath.startsWith(`..${path.sep}`)
        || path.isAbsolute(relativeFilePath)
      ) {
        response.writeHead(400)
        response.end('unsafe path')
        return
      }

      const contents = await fs.readFile(filePath)
      requestedPreviewPaths.add(`/${relativePath}`)
      response.writeHead(200, {
        'content-type': previewContentType(filePath),
        'cross-origin-embedder-policy': 'require-corp',
        'cross-origin-opener-policy': 'same-origin',
        'cache-control': 'no-store'
      })
      response.end(contents)
    } catch {
      response.writeHead(404)
      response.end('not found')
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert(address && typeof address === 'object')

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ serviceWorkers: 'block' })
    const page = await context.newPage()
    await page.route('https://unpkg.com/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        headers: {
          'access-control-allow-origin': '*',
          'cross-origin-resource-policy': 'cross-origin'
        },
        body: WEB_CONTAINER_BROWSER_MOCK
      })
    })
    await page.route('https://preview.invalid/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>Mock WebContainer server</title>'
      })
    })

    await page.goto(`http://127.0.0.1:${String(address.port)}/`, {
      waitUntil: 'domcontentloaded'
    })
    await page.waitForFunction(() => {
      const iframe = document.querySelector<HTMLIFrameElement>('#preview')
      return iframe?.style.display === 'block'
        && iframe.src === 'https://preview.invalid/'
    }, undefined, { timeout: 30_000 })

    const browserState = await page.evaluate(() => {
      const state = (globalThis as typeof globalThis & {
        __GCS_WEB_CONTAINER_MOCK__?: {
          mounts: Array<{ binaryFiles: number; paths: string[] }>
          spawn: {
            args: string[]
            command: string
            options: { env: Record<string, string> }
          } | null
        }
      }).__GCS_WEB_CONTAINER_MOCK__
      return {
        logs: document.querySelector('#logs')?.textContent ?? '',
        state
      }
    })
    assert(browserState.state, 'Generated preview did not boot the WebContainer wrapper.')
    assert.equal(
      browserState.state.mounts.length,
      manifestValue.files.length + 1,
      'Generated preview did not mount the bootstrap tree and every manifest shard.'
    )
    const mountedPaths = browserState.state.mounts.flatMap(mount => mount.paths)
    for (const manifestEntry of manifestValue.files) {
      assert(
        mountedPaths.some(filePath =>
          filePath === manifestEntry.mountPoint
          || filePath.startsWith(`${manifestEntry.mountPoint}/`)
        ),
        `Generated preview did not wrap mount point "${manifestEntry.mountPoint}".`
      )
      assert(
        requestedPreviewPaths.has(`/${manifestEntry.file}`),
        `Generated preview did not fetch shard "${manifestEntry.file}".`
      )
    }
    assert(
      browserState.state.mounts.some(mount => mount.binaryFiles > 0),
      'Generated preview did not decode any base64 file into Uint8Array.'
    )
    assert.deepEqual(browserState.state.spawn, {
      command: 'node',
      args: ['.output/server/index.mjs'],
      options: {
        env: {
          PGLITE_DATA_DIR: 'idb://gcs-ssc',
          NITRO_PORT: '3000',
          NITRO_HOST: '0.0.0.0',
          BETTER_AUTH_SECRET: 'a_very_secret_string_for_demo_purposes',
          GCS_RUNTIME_MIGRATION_MODE: 'webcontainer-demo',
          GCS_DEMO_MIGRATION_SUFFIX: 'seed',
          NODE_ENV: 'production'
        }
      }
    }, 'Generated preview spawned an unexpected WebContainer command or environment.')
    assert.match(browserState.logs, /MOCK_WEB_CONTAINER_PROCESS_READY/)
    assert(requestedPreviewPaths.has(`/${manifestFile}`))
    await context.close()
  } finally {
    if (browser !== null) {
      await browser.close()
    }
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    })
  }

  console.info(
    `[webcontainer] Browser wrapper loaded ${String(manifestValue.files.length)} generated mount shards.`
  )
}

/** Reconstructs serialized shards and boots the real standalone Nitro entry source-free. */
export const testWebContainerArtifact = async (
  outputDirectory = '.output'
): Promise<void> => {
  const outputPath = path.resolve(outputDirectory)
  const temporaryRoot = await fs.mkdtemp(path.join(tmpdir(), 'gcs-webcontainer-artifact-'))
  const serializedRoot = path.join(temporaryRoot, 'serialized')
  const reconstructedRoot = path.join(temporaryRoot, 'reconstructed')
  let child: ChildProcessWithoutNullStreams | null = null

  try {
    const payloads = await buildOutputPayloads(outputPath)
    const bundle = buildWebContainerPayloadBundle(payloads)
    await fs.mkdir(serializedRoot)
    await fs.writeFile(
      path.join(serializedRoot, bundle.manifestFileName),
      JSON.stringify(bundle.manifest)
    )
    await Promise.all(bundle.serializedPayloads.map(async (serializedPayload, index) => {
      const entry = bundle.manifest.files[index]
      assert(entry, `Missing manifest entry for WebContainer shard ${String(index)}.`)
      await fs.writeFile(path.join(serializedRoot, entry.file), serializedPayload)
    }))

    const serializedArtifact = bundle.serializedPayloads.join('\n')
    const outputRealPath = await fs.realpath(outputPath)
    for (const forbiddenRoot of new Set([
      process.cwd(),
      path.dirname(outputPath),
      path.dirname(outputRealPath)
    ])) {
      assert(
        !serializedArtifact.includes(forbiddenRoot),
        `Serialized WebContainer payload leaked host path ${forbiddenRoot}.`
      )
    }

    const manifestValue: unknown = JSON.parse(
      await fs.readFile(path.join(serializedRoot, bundle.manifestFileName), 'utf-8')
    )
    assert(isSerializedManifest(manifestValue), 'Serialized WebContainer manifest is invalid.')
    for (const entry of manifestValue.files) {
      assert(
        (entry.mountPoint.startsWith('.output/') || entry.mountPoint === 'demo-assets')
        && !entry.mountPoint.split('/').includes('..'),
        `Unsafe WebContainer mount point: ${entry.mountPoint}`
      )
      const tree = JSON.parse(
        await fs.readFile(path.join(serializedRoot, entry.file), 'utf-8')
      ) as SerializedTree
      await materializeTree(path.join(reconstructedRoot, entry.mountPoint), tree)
    }
    const runtimeExtensions = await readRuntimeExtensionDefinitions(reconstructedRoot)

    const port = await findAvailablePort()
    const pgliteDataDirectory = path.join(temporaryRoot, 'pglite')
    let output = ''
    child = spawn('node', ['.output/server/index.mjs'], {
      cwd: reconstructedRoot,
      env: buildWebContainerSmokeEnvironment(port, pgliteDataDirectory)
    })
    const appendOutput = (chunk: Buffer) => {
      output += chunk.toString('utf-8')
    }
    child.stdout.on('data', appendOutput)
    child.stderr.on('data', appendOutput)

    await waitForNitro(
      child,
      `http://127.0.0.1:${String(port)}/api/auth/get-session`,
      () => output
    )
    await waitForCoreMigrationResult(child, () => output)
    await stopProcess(child)
    child = null
    assertNoMigrationFailureOutput(output)
    assert(
      (await fs.stat(pgliteDataDirectory)).isDirectory(),
      'The reconstructed Nitro server did not initialize its isolated PGlite directory.'
    )
    try {
      await verifyWebContainerDatabase(pgliteDataDirectory, runtimeExtensions)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`${message}\n${output}`, { cause: error })
    }
    console.info(
      `[webcontainer] Booted ${String(payloads.length)} serialized shards (${String(serializedArtifact.length)} bytes), hash ${bundle.hash}.`
    )
  } finally {
    if (child) {
      await stopProcess(child)
    }
    await fs.rm(temporaryRoot, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const run = async () => {
    const previewDirectory = process.argv[3]
    if (previewDirectory) {
      await testGeneratedWebContainerPreview(previewDirectory)
    }
    await testWebContainerArtifact(process.argv[2])
  }
  run().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
