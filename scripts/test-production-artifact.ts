import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  access,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm
} from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { citext } from '@electric-sql/pglite/contrib/citext'
import PizZip from 'pizzip'

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url))
const DEFAULT_START_TIMEOUT_MS = 90_000
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_AUTH_SECRET = 'production-artifact-test-secret-123456'
const DEFAULT_EXTENSION_SECRET = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
const BUILD_DATABASE_URL_CANARY = 'postgres://artifact-build-canary:must-not-be-bundled@db-build-canary.invalid:6543/artifact'
const BUILD_PGLITE_DATA_DIR_CANARY = '/gcs-artifact-build-canary/pglite-data-must-not-be-bundled'
const BUILD_GITHUB_CLIENT_ID_CANARY = 'artifact-build-github-client-id-must-not-be-bundled'
const BUILD_GITHUB_CLIENT_SECRET_CANARY = 'artifact-build-github-client-secret-must-not-be-bundled'
const BUILD_AUTH_SECRET_CANARY = 'artifact-build-auth-secret-must-not-be-bundled'
const BUILD_AUTH_URL_CANARY = 'https://artifact-build-auth-url.invalid'
const EXPECTED_STORAGE_PROVIDER_KEYS = ['gcs-storage-local', 'gcs-storage-s3'] as const
const BUILD_AUTH_TRUSTED_ORIGINS_CANARY = 'https://artifact-build-trusted-origin.invalid'
const BUILD_AUTH_COOKIE_VERSION_CANARY = 'artifact-build-cookie-version-must-not-be-bundled'
const BUILD_EXTENSION_SECRET_CANARY = 'artifact-build-extension-secret-must-not-be-bundled'
const DATABASE_URL_PRECEDENCE_CANARY = 'postgres://artifact-runtime-canary:runtime-only@127.0.0.1:0/artifact'

export const BUILD_RUNTIME_CONFIG_CANARIES = [
  BUILD_DATABASE_URL_CANARY,
  BUILD_PGLITE_DATA_DIR_CANARY,
  BUILD_GITHUB_CLIENT_ID_CANARY,
  BUILD_GITHUB_CLIENT_SECRET_CANARY,
  BUILD_AUTH_SECRET_CANARY,
  BUILD_AUTH_URL_CANARY,
  BUILD_AUTH_TRUSTED_ORIGINS_CANARY,
  BUILD_AUTH_COOKIE_VERSION_CANARY,
  BUILD_EXTENSION_SECRET_CANARY
] as const

export const PRODUCTION_CORE_MIGRATIONS = [
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
  '0012_recommendation_revision'
] as const

export const PROHIBITED_PRODUCTION_BUNDLE_VALUES = [
  '9999_seed',
  'root@example.com',
  'agency@example.com',
  'password123',
  'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  'MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCJtO67dOz+1eIO',
  'local-claims-service-account-public-key'
] as const

const FORBIDDEN_ARTIFACT_SOURCE_EXTENSIONS = new Set([
  '.cts',
  '.jsx',
  '.map',
  '.mts',
  '.ts',
  '.tsx',
  '.vue'
])

export const ENGLISH_TEMPLATE_CONTENT_DIGESTS = {
  'contribution-agreement-en.docx': 'b4b217fee7c22a6cfbe0e5003705f597e73a6aa03ba8fae8da0008057c9cbfb7',
  'schedule-1-en.docx': '1e130f0198065864b2c63490e0c44900be2f899b896a55f3015d16c646df2e94',
  'schedule-2-en.docx': 'aa9650a4e9c209e20924e68a0eb68eba7b381ad2607c4420cbf5598f176828e0',
  'schedule-3-en.docx': 'd0d0ea2f7fb659f1e183f850a05c70b2355409a1de416f8e3d58d028acc73e5d',
  'schedule-4-en.docx': '181c414f35e3f62a99433c4c71f63aa75ad5aae36df6d39a5477bff27bf99b06'
} as const

export interface ProductionArtifactTestConfig {
  buildArtifact: boolean
  outputDir: string
}

/**
 * Rejects platforms where this smoke cannot establish a read-only artifact.
 *
 * Windows requires ACL-based enforcement that this POSIX smoke does not
 * simulate with chmod.
 *
 * @param platform - Runtime operating-system platform.
 * @param uid - Effective POSIX user identifier when available.
 */
export const assertProductionArtifactSmokeSupported = (
  platform: NodeJS.Platform = process.platform,
  uid: number | undefined = process.getuid?.()
): void => {
  if (platform === 'win32') {
    throw new Error(
      'The read-only production artifact smoke is POSIX-only; Windows ACL validation is not implemented.'
    )
  }

  if (uid === 0) {
    throw new Error(
      'The read-only production artifact smoke must run as a non-root user because UID 0 can bypass chmod protections. Run CI or the container with an unprivileged service UID.'
    )
  }
}

interface RunningArtifact {
  child: ChildProcess
  output: () => string
}

interface ArtifactRuntimeConfig {
  databaseUrl?: string
  nuxtDatabaseUrl?: string
  nuxtPgliteDataDir?: string
  pgliteDataDir?: string
  storageDir: string
}

interface MigrationRow {
  name: string
}

interface RestoredRelationRow {
  table_schema: string
  table_name: string
}

const EXPECTED_ADMIN_DUMP_RELATIONS: RestoredRelationRow[] = [
  { table_schema: 'extensions', table_name: 'agency_enablement' },
  { table_schema: 'public', table_name: 'Agency_Profile' },
  { table_schema: 'public', table_name: 'Common_Entity' },
  { table_schema: 'public', table_name: 'Funding_Case_Agreement_Profile' },
  { table_schema: 'public', table_name: 'Transfer_Payment_Profile' }
]

const delay = async (durationMs: number): Promise<void> => {
  await new Promise(resolveDelay => setTimeout(resolveDelay, durationMs))
}

/**
 * Checks whether a filesystem path exists.
 *
 * @param path - Filesystem path to inspect.
 * @returns Whether the path is accessible.
 */
const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Determines whether any packaged server chunk contains a required registry marker.
 *
 * @param directory - Artifact directory to inspect recursively.
 * @param marker - Exact UTF-8 marker expected in a packaged chunk.
 * @returns Whether the marker was found.
 */
const artifactContainsMarker = async (directory: string, marker: string): Promise<boolean> => {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (await artifactContainsMarker(entryPath, marker)) return true
      continue
    }
    if (!entry.isFile()) continue
    let overlap = Buffer.alloc(0)
    const markerBytes = Buffer.from(marker)
    const stream = createReadStream(entryPath)
    for await (const chunkValue of stream) {
      const chunk = Buffer.isBuffer(chunkValue) ? chunkValue : Buffer.from(chunkValue)
      const contents = Buffer.concat([overlap, chunk])
      if (contents.includes(markerBytes)) return true
      overlap = contents.subarray(Math.max(0, contents.length - markerBytes.length + 1))
    }
  }
  return false
}

/**
 * Scans a file for configuration values that must remain runtime-only.
 *
 * @param filePath - Artifact file to scan.
 * @returns Whether the file contains a runtime configuration canary.
 */
const fileContainsRuntimeConfigCanary = async (filePath: string): Promise<boolean> => {
  const canaryBuffers = [
    ...BUILD_RUNTIME_CONFIG_CANARIES,
    ...PROHIBITED_PRODUCTION_BUNDLE_VALUES
  ].map(value => Buffer.from(value))
  const overlapSize = Math.max(...canaryBuffers.map(value => value.byteLength)) - 1
  let overlap = Buffer.alloc(0)
  const stream = createReadStream(filePath)

  for await (const chunkValue of stream) {
    const chunk = Buffer.isBuffer(chunkValue) ? chunkValue : Buffer.from(chunkValue)
    const contents = Buffer.concat([overlap, chunk])
    if (canaryBuffers.some(canary => contents.includes(canary))) {
      return true
    }
    overlap = contents.subarray(Math.max(0, contents.byteLength - overlapSize))
  }

  return false
}

/**
 * Finds source and source-map files that must not ship in production output.
 *
 * @param artifactDir - Artifact directory to inspect recursively.
 * @returns First forbidden source artifact, if present.
 */
export const findForbiddenArtifactSourceFile = async (artifactDir: string): Promise<string | null> => {
  const entries = await readdir(artifactDir, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = join(artifactDir, entry.name)
    if (entry.isDirectory()) {
      const nestedMatch = await findForbiddenArtifactSourceFile(entryPath)
      if (nestedMatch !== null) {
        return nestedMatch
      }
    } else if (entry.isFile()) {
      const extension = entry.name.slice(entry.name.lastIndexOf('.'))
      if (FORBIDDEN_ARTIFACT_SOURCE_EXTENSIONS.has(extension)) {
        return entryPath
      }
    }
  }
  return null
}

/**
 * Finds demo-only seed asset namespaces or raw chunks in production output.
 *
 * @param artifactDir - Artifact directory to inspect recursively.
 * @returns First prohibited seed asset path, if present.
 */
export const findProhibitedProductionSeedAsset = async (artifactDir: string): Promise<string | null> => {
  const entries = await readdir(artifactDir, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = join(artifactDir, entry.name)
    if (entry.name === 'demo-assets' || entry.name.startsWith('Contribution Agreement.')) {
      return entryPath
    }
    if (entry.isDirectory()) {
      const nestedMatch = await findProhibitedProductionSeedAsset(entryPath)
      if (nestedMatch !== null) {
        return nestedMatch
      }
    }
  }
  return null
}

/**
 * Searches a built artifact for deployment configuration that must remain runtime-only.
 *
 * @param artifactDir - Copied production artifact root.
 * @returns First file containing a build runtime-config canary, if present.
 */
export const findArtifactRuntimeConfigCanary = async (artifactDir: string): Promise<string | null> => {
  const entries = await readdir(artifactDir, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = join(artifactDir, entry.name)
    if (entry.isDirectory()) {
      const nestedMatch = await findArtifactRuntimeConfigCanary(entryPath)
      if (nestedMatch !== null) {
        return nestedMatch
      }
    } else if (entry.isFile() && await fileContainsRuntimeConfigCanary(entryPath)) {
      return entryPath
    }
  }
  return null
}

/**
 * Resolves build-versus-existing-artifact CLI settings.
 *
 * @param args - Command-line arguments.
 * @param repositoryRoot - Repository root used for relative artifact paths.
 * @returns Production artifact smoke configuration.
 */
export const resolveProductionArtifactTestConfig = (
  args: string[] = process.argv.slice(2),
  repositoryRoot: string = REPOSITORY_ROOT
): ProductionArtifactTestConfig => {
  let buildArtifact = true
  let outputDir = resolve(repositoryRoot, '.output')

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--skip-build') {
      buildArtifact = false
      continue
    }
    if (argument === '--artifact-dir') {
      const value = args[index + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error('Missing value for --artifact-dir')
      }
      outputDir = resolve(repositoryRoot, value)
      buildArtifact = false
      index += 1
      continue
    }
    if (argument?.startsWith('--artifact-dir=')) {
      const value = argument.slice('--artifact-dir='.length)
      if (value.length === 0) {
        throw new Error('Missing value for --artifact-dir')
      }
      outputDir = resolve(repositoryRoot, value)
      buildArtifact = false
      continue
    }
    throw new Error(`Unknown production artifact test argument: ${String(argument)}`)
  }

  return { buildArtifact, outputDir }
}

/**
 * Hashes exact DOCX entry names and bytes while ignoring ZIP timestamps.
 *
 * @param bytes - DOCX package bytes.
 * @returns Stable content digest.
 */
export const createDocxContentDigest = (bytes: Buffer): string => {
  const zip = new PizZip(bytes)
  const digest = createHash('sha256')
  const entryNames = Object.keys(zip.files)
    .filter(entryName => zip.files[entryName]?.dir !== true)
    .sort()

  for (const entryName of entryNames) {
    const entryBytes = zip.file(entryName)?.asUint8Array()
    if (entryBytes === undefined) {
      throw new Error(`Could not read DOCX entry ${entryName}`)
    }
    digest.update(`${entryName.length}:${entryName}:${entryBytes.byteLength}:`)
    digest.update(entryBytes)
  }
  return digest.digest('hex')
}

/**
 * Removes the psql-only safety wrappers emitted by newer pg_dump versions.
 *
 * The SQL inside the wrappers remains unchanged and is executed by PGlite.
 *
 * @param dump - Plain-text PostgreSQL dump.
 * @returns SQL accepted by PGlite's protocol executor.
 */
export const prepareAdminSqlDumpForRestore = (dump: string): string => {
  return dump
    .split(/\r?\n/)
    .filter(line => !/^\\(?:restrict|unrestrict)\s+\S+\s*$/.test(line))
    .join('\n')
}

/**
 * Restores an admin dump into a blank database and verifies representative schema.
 *
 * @param dump - Plain-text PostgreSQL dump returned by the admin endpoint.
 */
export const verifyAdminSqlDumpRestorable = async (dump: string): Promise<void> => {
  const pg = new PGlite('memory://', {
    extensions: { citext }
  })

  try {
    await pg.exec(prepareAdminSqlDumpForRestore(dump))
    const migrations = await pg.query<MigrationRow>(
      'select name from public.kysely_migration order by name'
    )
    assert.deepEqual(
      migrations.rows.map(row => row.name),
      PRODUCTION_CORE_MIGRATIONS
    )

    const relations = await pg.query<RestoredRelationRow>(`
      select table_schema, table_name
      from information_schema.tables
      where
        (table_schema = 'extensions' and table_name = 'agency_enablement')
        or (
          table_schema = 'public'
          and table_name in (
            'Agency_Profile',
            'Common_Entity',
            'Funding_Case_Agreement_Profile',
            'Transfer_Payment_Profile'
          )
        )
      order by table_schema, table_name
    `)
    assert.deepEqual(relations.rows, EXPECTED_ADMIN_DUMP_RELATIONS)
  } finally {
    await pg.close()
  }
}

/**
 * Builds production output without embedding caller database configuration.
 */
const runBuild = async (): Promise<void> => {
  const buildEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    BETTER_AUTH_COOKIE_VERSION: BUILD_AUTH_COOKIE_VERSION_CANARY,
    BETTER_AUTH_SECRET: BUILD_AUTH_SECRET_CANARY,
    BETTER_AUTH_TRUSTED_ORIGINS: BUILD_AUTH_TRUSTED_ORIGINS_CANARY,
    BETTER_AUTH_URL: BUILD_AUTH_URL_CANARY,
    DATABASE_URL: BUILD_DATABASE_URL_CANARY,
    GCS_EXTENSION_SECRETS_KEY: BUILD_EXTENSION_SECRET_CANARY,
    NUXT_GITHUB_CLIENT_ID: BUILD_GITHUB_CLIENT_ID_CANARY,
    NUXT_GITHUB_CLIENT_SECRET: BUILD_GITHUB_CLIENT_SECRET_CANARY,
    PGLITE_DATA_DIR: BUILD_PGLITE_DATA_DIR_CANARY,
    NUXT_DISABLE_SOURCEMAPS: 'true'
  }
  delete buildEnvironment.NUXT_DATABASE_URL
  delete buildEnvironment.NUXT_PGLITE_DATA_DIR

  const child = spawn('bun', ['run', 'build'], {
    cwd: REPOSITORY_ROOT,
    env: buildEnvironment,
    stdio: 'inherit'
  })
  const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
    child.once('error', rejectExit)
    child.once('exit', code => resolveExit(code === null ? 1 : code))
  })
  if (exitCode !== 0) {
    throw new Error(`Production build exited with code ${String(exitCode)}`)
  }
}

/**
 * Recursively makes an artifact tree read-only on POSIX.
 *
 * @param path - File or directory tree to protect.
 */
const makeTreeReadOnlyPosix = async (path: string): Promise<void> => {
  const entries = await readdir(path, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = join(path, entry.name)
    if (entry.isDirectory()) {
      await makeTreeReadOnlyPosix(entryPath)
    } else {
      await chmod(entryPath, 0o444)
    }
  }
  await chmod(path, 0o555)
}

/**
 * Restores directory write access so a protected artifact can be removed.
 *
 * @param path - Directory tree to make writable.
 */
const makeDirectoriesWritable = async (path: string): Promise<void> => {
  if (!await pathExists(path)) {
    return
  }
  await chmod(path, 0o700)
  const entries = await readdir(path, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await makeDirectoriesWritable(join(path, entry.name))
    }
  }
}

/**
 * Creates an artifact-smoke storage root with deterministic POSIX permissions.
 *
 * The chmod makes the final mode independent of both permissive and restrictive
 * caller umasks.
 *
 * @param path - Storage root to create.
 */
export const createPrivateArtifactStorageRoot = async (path: string): Promise<void> => {
  await mkdir(path, { mode: 0o700 })
  await chmod(path, 0o700)
}

/**
 * Creates a temporary artifact root using its canonical filesystem spelling.
 *
 * This keeps trusted system aliases such as macOS `/var` from appearing as
 * symlink ancestors of the service-private storage root.
 *
 * @param temporaryDirectory - Parent directory for the temporary artifact root.
 * @returns Canonical absolute path to the created root.
 */
export const createCanonicalArtifactTemporaryRoot = async (
  temporaryDirectory: string = tmpdir()
): Promise<string> => {
  const temporaryRoot = await mkdtemp(join(temporaryDirectory, 'gcs-production-artifact-'))
  return await realpath(temporaryRoot)
}

/**
 * Acquires an available loopback TCP port.
 *
 * @returns Ephemeral port assigned by the operating system.
 */
const acquireEphemeralPort = async (): Promise<number> => await new Promise((resolvePort, rejectPort) => {
  const server = createServer()
  server.once('error', rejectPort)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (address === null || typeof address === 'string') {
      server.close()
      rejectPort(new Error('Could not resolve an ephemeral TCP port'))
      return
    }
    server.close(error => {
      if (error) {
        rejectPort(error)
        return
      }
      resolvePort(address.port)
    })
  })
})

/**
 * Starts the copied artifact with external writable database and file roots.
 *
 * @param artifactDir - POSIX read-only copied artifact root.
 * @param port - HTTP listener port.
 * @param runtimeConfig - Runtime database and local-file configuration.
 * @returns Running artifact process and captured output.
 */
const startArtifact = (
  artifactDir: string,
  port: number,
  runtimeConfig: ArtifactRuntimeConfig
): RunningArtifact => {
  const baseUrl = `http://127.0.0.1:${String(port)}`
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    GCS_LOCAL_FILE_STORAGE_DIR: runtimeConfig.storageDir,
    GCS_EXTENSION_SECRETS_KEY: DEFAULT_EXTENSION_SECRET,
    NUXT_AUTH_SECRET: DEFAULT_AUTH_SECRET,
    NUXT_AUTH_URL: baseUrl,
    NUXT_AUTH_TRUSTED_ORIGINS: baseUrl
  }
  delete environment.DATABASE_URL
  delete environment.PGLITE_DATA_DIR
  delete environment.NUXT_DATABASE_URL
  delete environment.NUXT_PGLITE_DATA_DIR

  if (runtimeConfig.databaseUrl !== undefined) {
    environment.DATABASE_URL = runtimeConfig.databaseUrl
  }
  if (runtimeConfig.nuxtDatabaseUrl !== undefined) {
    environment.NUXT_DATABASE_URL = runtimeConfig.nuxtDatabaseUrl
  }
  if (runtimeConfig.pgliteDataDir !== undefined) {
    environment.PGLITE_DATA_DIR = runtimeConfig.pgliteDataDir
  }
  if (runtimeConfig.nuxtPgliteDataDir !== undefined) {
    environment.NUXT_PGLITE_DATA_DIR = runtimeConfig.nuxtPgliteDataDir
  }

  const outputChunks: string[] = []
  const child = spawn('node', ['server/index.mjs'], {
    cwd: artifactDir,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout?.on('data', chunk => outputChunks.push(chunk.toString()))
  child.stderr?.on('data', chunk => outputChunks.push(chunk.toString()))

  return {
    child,
    output: () => outputChunks.join('')
  }
}

/**
 * Waits for the seed migration or surfaces captured startup failures.
 *
 * @param artifact - Running production artifact.
 * @param timeoutMs - Bounded startup timeout.
 */
const waitForProductionMigrations = async (
  artifact: RunningArtifact,
  timeoutMs: number = DEFAULT_START_TIMEOUT_MS
): Promise<void> => {
  const expectedLine = 'migration "0012_recommendation_revision" was executed successfully'
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const output = artifact.output()
    if (output.includes(expectedLine)) {
      return
    }
    if (output.includes('failed to migrate')) {
      throw new Error(`Production artifact migration failed.\n${output}`)
    }
    if (artifact.child.exitCode !== null) {
      throw new Error(
        `Production artifact exited with code ${String(artifact.child.exitCode)} before seeding.\n${artifact.output()}`
      )
    }
    await delay(100)
  }
  throw new Error(`Timed out waiting for production artifact migrations.\n${artifact.output()}`)
}

/**
 * Confirms a deliberately unreachable DATABASE_URL wins over a valid Nuxt PGlite fallback.
 *
 * @param artifact - Running precedence-probe artifact.
 * @param timeoutMs - Bounded probe timeout.
 */
const waitForDatabaseUrlPrecedence = async (
  artifact: RunningArtifact,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const output = artifact.output()
    if (output.includes('migration "0012_recommendation_revision" was executed successfully')) {
      throw new Error(`PGLite unexpectedly won precedence over runtime DATABASE_URL.\n${output}`)
    }
    if (output.includes('failed to migrate')) {
      return
    }
    if (artifact.child.exitCode !== null) {
      throw new Error(
        `DATABASE_URL precedence probe exited with code ${String(artifact.child.exitCode)}.\n${output}`
      )
    }
    await delay(100)
  }
  throw new Error(`Timed out waiting for the DATABASE_URL precedence probe.\n${artifact.output()}`)
}

/**
 * Waits a bounded interval for a child process to exit.
 *
 * @param child - Child process to observe.
 * @param timeoutMs - Maximum wait duration in milliseconds.
 * @returns Whether the child exited before the timeout.
 */
const waitForProcessExit = async (child: ChildProcess, timeoutMs: number): Promise<boolean> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true
  }

  return await new Promise(resolveExit => {
    const timeout = setTimeout(() => {
      child.off('exit', handleExit)
      resolveExit(false)
    }, timeoutMs)
    const handleExit = (): void => {
      clearTimeout(timeout)
      resolveExit(true)
    }
    child.once('exit', handleExit)
  })
}

/**
 * Stops a running artifact, escalating to SIGKILL when required.
 *
 * @param artifact - Artifact process to stop.
 */
const stopArtifact = async (artifact: RunningArtifact): Promise<void> => {
  if (artifact.child.exitCode !== null || artifact.child.signalCode !== null) {
    return
  }
  artifact.child.kill('SIGTERM')
  if (await waitForProcessExit(artifact.child, 5_000)) {
    return
  }
  artifact.child.kill('SIGKILL')
  if (!await waitForProcessExit(artifact.child, 2_000)) {
    throw new Error('Could not stop production artifact process')
  }
}

/**
 * Verifies route authorization and validates the exact packaged dump worker.
 *
 * @param baseUrl - Production artifact base URL.
 * @param artifactDir - Copied artifact root.
 * @param artifact - Running process used to include server diagnostics on failure.
 */
const verifyAdminDump = async (
  baseUrl: string,
  artifactDir: string,
  artifact: RunningArtifact
): Promise<void> => {
  const unauthorizedResponse = await fetch(`${baseUrl}/api/admin/dump`, {
    signal: AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS)
  })
  assert.equal(
    unauthorizedResponse.status,
    401,
    `Admin dump route did not reject anonymous access.\n${artifact.output()}`
  )

  const worker = new Worker(join(artifactDir, 'server', 'admin-sql-dump-worker.mjs'))
  const dump = await new Promise<string>((resolveDump, rejectDump) => {
    const timer = setTimeout(() => {
      void worker.terminate().finally(() => rejectDump(new Error('Packaged admin dump worker timed out')))
    }, DEFAULT_REQUEST_TIMEOUT_MS)
    worker.once('message', (message: unknown) => {
      clearTimeout(timer)
      if (typeof message === 'object' && message !== null && 'ok' in message
        && message.ok === true && 'sql' in message && typeof message.sql === 'string') {
        resolveDump(message.sql)
      } else {
        rejectDump(new Error(`Packaged admin dump worker failed: ${JSON.stringify(message)}`))
      }
    })
    worker.once('error', rejectDump)
  }).finally(async () => {
    await worker.terminate()
  })

  const dumpMigrations = Array.from(
    dump.matchAll(/INSERT INTO public\.kysely_migration VALUES \('([^']+)'/g),
    match => match[1]
  )
  assert.deepEqual(dumpMigrations, PRODUCTION_CORE_MIGRATIONS)
  assert.doesNotMatch(dump, /9999_seed|root@example\.com|agency@example\.com/)
  assert.doesNotMatch(dump, / OWNER TO |\n(?:GRANT|REVOKE) /)
  await verifyAdminSqlDumpRestorable(dump)
}

/**
 * Verifies representative filtered extension assets are served by Nitro.
 *
 * @param baseUrl - Production artifact base URL.
 */
const verifyExtensionPublicAssets = async (baseUrl: string): Promise<void> => {
  const assets = [
    {
      marker: 'QUALITY_METER_LABELS',
      path: '/extensions/gcs-narrative-quality/client/runtime.js'
    },
    {
      marker: 'transformers-cache',
      path: '/extensions/gcs-narrative-quality/client/worker.js'
    }
  ]
  for (const asset of assets) {
    const response = await fetch(`${baseUrl}${asset.path}`, {
      signal: AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS)
    })
    const contents = await response.text()
    assert.equal(response.status, 200, `Extension asset ${asset.path} returned ${String(response.status)}`)
    assert.match(response.headers.get('content-type') ?? '', /javascript/)
    assert.ok(contents.includes(asset.marker), `Extension asset ${asset.path} is missing expected content`)
  }
}

/**
 * Verifies the expected core migrations in a PGlite data directory.
 *
 * @param pgliteDataDir - PGlite database directory to inspect.
 */
const verifyCoreMigrations = async (pgliteDataDir: string): Promise<void> => {
  const pg = new PGlite(pgliteDataDir, {
    extensions: { citext }
  })
  try {
    const result = await pg.query<MigrationRow>(
      'select name from kysely_migration order by timestamp, name'
    )
    assert.deepEqual(result.rows.map(row => row.name), PRODUCTION_CORE_MIGRATIONS)
  } finally {
    await pg.close()
  }
}

/**
 * Builds or accepts, copies, and validates a source-free POSIX production artifact.
 *
 * @param config - Production artifact test configuration.
 */
export const runProductionArtifactTest = async (
  config: ProductionArtifactTestConfig
): Promise<void> => {
  assertProductionArtifactSmokeSupported()

  if (config.buildArtifact) {
    console.info('[artifact] Building fresh production output for the POSIX read-only smoke.')
    await runBuild()
  }
  assert.ok(await pathExists(join(config.outputDir, 'server', 'index.mjs')), 'Production output is missing server/index.mjs')

  const temporaryRoot = await createCanonicalArtifactTemporaryRoot()
  const artifactDir = join(temporaryRoot, 'artifact')
  const pgliteDataDir = join(temporaryRoot, 'pglite')
  const storageDir = join(temporaryRoot, 'file-storage')
  const ignoredNuxtPgliteDir = join(temporaryRoot, 'nuxt-pglite-must-not-be-used')
  const nuxtPgliteDataDir = join(temporaryRoot, 'nuxt-pglite')
  const nuxtStorageDir = join(temporaryRoot, 'nuxt-file-storage')
  const databaseUrlProbePgliteDir = join(temporaryRoot, 'database-url-probe-pglite')
  const databaseUrlProbeStorageDir = join(temporaryRoot, 'database-url-probe-storage')
  const nuxtDatabaseUrlProbePgliteDir = join(temporaryRoot, 'nuxt-database-url-probe-pglite')
  const nuxtDatabaseUrlProbeStorageDir = join(temporaryRoot, 'nuxt-database-url-probe-storage')
  let artifact: RunningArtifact | null = null

  try {
    await Promise.all([
      cp(config.outputDir, artifactDir, {
        recursive: true,
        dereference: true,
        errorOnExist: true,
        force: false
      }),
      mkdir(pgliteDataDir),
      createPrivateArtifactStorageRoot(storageDir),
      mkdir(nuxtPgliteDataDir),
      createPrivateArtifactStorageRoot(nuxtStorageDir),
      mkdir(databaseUrlProbePgliteDir),
      createPrivateArtifactStorageRoot(databaseUrlProbeStorageDir),
      mkdir(nuxtDatabaseUrlProbePgliteDir),
      createPrivateArtifactStorageRoot(nuxtDatabaseUrlProbeStorageDir)
    ])
    await Promise.all([
      assert.rejects(access(join(artifactDir, 'demo-assets'))),
      assert.rejects(access(join(artifactDir, 'scripts'))),
      assert.rejects(access(join(artifactDir, 'server', 'database', 'migrations')))
    ])
    const canaryFile = await findArtifactRuntimeConfigCanary(artifactDir)
    assert.equal(canaryFile, null, `Build runtime configuration was embedded in ${String(canaryFile)}`)
    const forbiddenSourceFile = await findForbiddenArtifactSourceFile(artifactDir)
    assert.equal(forbiddenSourceFile, null, `Production artifact contains source material: ${String(forbiddenSourceFile)}`)
    const prohibitedSeedAsset = await findProhibitedProductionSeedAsset(artifactDir)
    assert.equal(prohibitedSeedAsset, null, `Production artifact contains a demo seed asset: ${String(prohibitedSeedAsset)}`)
    for (const providerKey of EXPECTED_STORAGE_PROVIDER_KEYS) {
      assert.equal(
        await artifactContainsMarker(join(artifactDir, 'server'), providerKey),
        true,
        `Production artifact is missing storage provider ${providerKey}`
      )
    }
    await makeTreeReadOnlyPosix(artifactDir)

    let port = await acquireEphemeralPort()
    let baseUrl = `http://127.0.0.1:${String(port)}`
    artifact = startArtifact(
      artifactDir,
      port,
      {
        pgliteDataDir,
        storageDir,
        nuxtPgliteDataDir: ignoredNuxtPgliteDir
      }
    )
    await waitForProductionMigrations(artifact)
    console.info('[artifact] Production migrations completed without demo seed data.')

    await verifyExtensionPublicAssets(baseUrl)
    await verifyAdminDump(baseUrl, artifactDir, artifact)
    console.info('[artifact] Packaged production admin dump restored into a blank database.')

    await stopArtifact(artifact)
    artifact = null

    await verifyCoreMigrations(pgliteDataDir)
    assert.equal(await pathExists(ignoredNuxtPgliteDir), false, 'NUXT_PGLITE_DATA_DIR unexpectedly won precedence')
    assert.deepEqual(await readdir(storageDir), [], 'Production migrations unexpectedly wrote seed assets')
    console.info('[artifact] Verified plain PGLITE_DATA_DIR precedence and 10 production migrations without seed assets.')

    port = await acquireEphemeralPort()
    baseUrl = `http://127.0.0.1:${String(port)}`
    artifact = startArtifact(artifactDir, port, {
      nuxtPgliteDataDir,
      storageDir: nuxtStorageDir
    })
    await waitForProductionMigrations(artifact)
    await stopArtifact(artifact)
    artifact = null
    await verifyCoreMigrations(nuxtPgliteDataDir)
    assert.deepEqual(await readdir(nuxtStorageDir), [], 'Production migrations unexpectedly wrote Nuxt seed assets')
    console.info('[artifact] Verified NUXT_PGLITE_DATA_DIR runtime fallback.')

    port = await acquireEphemeralPort()
    artifact = startArtifact(artifactDir, port, {
      databaseUrl: DATABASE_URL_PRECEDENCE_CANARY,
      nuxtPgliteDataDir: databaseUrlProbePgliteDir,
      storageDir: databaseUrlProbeStorageDir
    })
    await waitForDatabaseUrlPrecedence(artifact)
    await stopArtifact(artifact)
    artifact = null
    assert.deepEqual(
      await readdir(databaseUrlProbePgliteDir),
      [],
      'NUXT_PGLITE_DATA_DIR was initialized despite runtime DATABASE_URL precedence'
    )
    console.info('[artifact] Verified plain DATABASE_URL runtime precedence without an external PostgreSQL service.')

    port = await acquireEphemeralPort()
    artifact = startArtifact(artifactDir, port, {
      nuxtDatabaseUrl: DATABASE_URL_PRECEDENCE_CANARY,
      nuxtPgliteDataDir: nuxtDatabaseUrlProbePgliteDir,
      storageDir: nuxtDatabaseUrlProbeStorageDir
    })
    await waitForDatabaseUrlPrecedence(artifact)
    await stopArtifact(artifact)
    artifact = null
    assert.deepEqual(
      await readdir(nuxtDatabaseUrlProbePgliteDir),
      [],
      'NUXT_PGLITE_DATA_DIR was initialized despite NUXT_DATABASE_URL precedence'
    )
    console.info('[artifact] Verified NUXT_DATABASE_URL translation and precedence over NUXT_PGLITE_DATA_DIR.')
  } finally {
    if (artifact !== null) {
      await stopArtifact(artifact).catch(error => {
        console.error('[artifact] Failed to stop artifact during cleanup.', error)
      })
    }
    await makeDirectoriesWritable(artifactDir).catch(() => {})
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

const main = async (): Promise<void> => {
  await runProductionArtifactTest(resolveProductionArtifactTestConfig())
  console.info('[artifact] POSIX read-only production artifact portability smoke passed.')
}

if (import.meta.main) {
  await main()
}
