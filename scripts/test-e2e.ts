/* eslint-disable jsdoc/require-jsdoc */
import { realpathSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { NUXT_ARTIFACT_LOCK_ENV, runWithNuxtArtifactLock } from './nuxt-artifact-lock'

const DEFAULT_PORT = 3005
const DEFAULT_WAIT_TIMEOUT_MS = 60_000
const DEFAULT_PGLITE_DATA_DIR_PREFIX = 'gcs-ssc-pglite-e2e-'
const DEFAULT_LOCAL_FILE_STORAGE_DIR_PREFIX = 'gcs-ssc-files-e2e-'
const DEFAULT_AUTH_SECRET = ['abcdefghijklmnopqrstuvwxyz', '123456'].join('')
const DEFAULT_PORT_SCAN_LIMIT = 50
const DEFAULT_PLAYWRIGHT_WORKERS = '1'
const E2E_POSTGRES_TEST_URL_ENV = 'E2E_POSTGRES_TEST_URL'

export const postgresE2eSpecPaths = [
  'tests/e2e/agreement-activity-readonly-lock.spec.ts',
  'tests/e2e/agreement-address-readonly-lock.spec.ts',
  'tests/e2e/agreement-budget-terminal-lock.spec.ts',
  'tests/e2e/agreement-child-id-search-boundaries.spec.ts',
  'tests/e2e/agreement-proponent-relationships.spec.ts',
  'tests/e2e/applicant-recipient-cross-agency.spec.ts',
  'tests/e2e/agreement-extension-persistence.spec.ts',
  'tests/e2e/transfer-payment-stream-identity.spec.ts',
  'tests/e2e/workflow-owner-recovery.spec.ts'
] as const

export const amendmentRefreshE2eSpecPaths = [
  'tests/e2e/agreement-amendment-completion-refresh.spec.ts'
] as const

export const agreementCloseoutE2eSpecPaths = [
  'tests/e2e/agreement-closeout.spec.ts'
] as const

export const workflowRecommendationE2eSpecPaths = [
  'tests/e2e/workflow-recommendation.spec.ts'
] as const

export const workflowSetupRetiredE2eSpecPaths = [
  'tests/e2e/workflow-setup-retired.spec.ts'
] as const

export const agreementAmendmentsE2eSpecPaths = [
  'tests/e2e/agreement-amendments.spec.ts'
] as const

export const attachmentsE2eSpecPaths = [
  'tests/e2e/attachments.spec.ts'
] as const

export const agencyStatusesE2eSpecPaths = [
  'tests/e2e/agency-statuses.spec.ts'
] as const

export const freshResetE2eSpecPaths = [
  'tests/e2e/design-time-mutation-coordination.spec.ts',
  'tests/e2e/setup-relationship-editors.spec.ts',
  'tests/e2e/assessment-calculated-fields.spec.ts',
  'tests/e2e/mixed-review-set-lifecycle.spec.ts',
  'tests/e2e/assessment-approval-execution.spec.ts',
  'tests/e2e/agreement-completion-lifecycle.spec.ts',
  'tests/e2e/agreement-record-state-presentation.spec.ts',
  'tests/e2e/agreement-risk-rating-workflow.spec.ts',
  'tests/e2e/workflow-outcome-branches.spec.ts',
  'tests/e2e/approval-execution-adversarial.spec.ts',
  'tests/e2e/document-template-formats.spec.ts',
  'tests/e2e/admin-gwcoa-routes.spec.ts',
  'tests/e2e/admin-gwcoa.spec.ts'
] as const

export const reviewScratchE2eFilePattern = String.raw`.*\.tmp\.spec\.ts$`

const postgresE2eBasenames = postgresE2eSpecPaths.map(path => path.split('/').at(-1))
const escapedPostgresE2eBasenames = postgresE2eBasenames
  .map(name => name?.replaceAll('.', String.raw`\.`))
  .join('|')
const escapedAmendmentRefreshE2eBasenames = amendmentRefreshE2eSpecPaths
  .map(path => path.split('/').at(-1)?.replaceAll('.', String.raw`\.`))
  .join('|')
const escapedAgreementCloseoutE2eBasenames = agreementCloseoutE2eSpecPaths
  .map(path => path.split('/').at(-1)?.replaceAll('.', String.raw`\.`))
  .join('|')
const escapedWorkflowRecommendationE2eBasenames = workflowRecommendationE2eSpecPaths
  .map(path => path.split('/').at(-1)?.replaceAll('.', String.raw`\.`))
  .join('|')
const escapedWorkflowSetupRetiredE2eBasenames = workflowSetupRetiredE2eSpecPaths
  .map(path => path.split('/').at(-1)?.replaceAll('.', String.raw`\.`))
  .join('|')
const escapedAgreementAmendmentsE2eBasenames = agreementAmendmentsE2eSpecPaths
  .map(path => path.split('/').at(-1)?.replaceAll('.', String.raw`\.`))
  .join('|')
const escapedAttachmentsE2eBasenames = attachmentsE2eSpecPaths
  .map(path => path.split('/').at(-1)?.replaceAll('.', String.raw`\.`))
  .join('|')
const escapedAgencyStatusesE2eBasenames = agencyStatusesE2eSpecPaths
  .map(path => path.split('/').at(-1)?.replaceAll('.', String.raw`\.`))
  .join('|')
const escapedFreshResetE2eBasenames = freshResetE2eSpecPaths
  .map(path => path.split('/').at(-1)?.replaceAll('.', String.raw`\.`))
  .join('|')

export const pgliteE2eFilePattern = String.raw`^(?!.*\.tmp\.spec\.ts$)(?!.*(?:${escapedPostgresE2eBasenames})$)(?!.*(?:${escapedAmendmentRefreshE2eBasenames})$)(?!.*(?:${escapedAgreementCloseoutE2eBasenames})$)(?!.*(?:${escapedWorkflowRecommendationE2eBasenames})$)(?!.*(?:${escapedWorkflowSetupRetiredE2eBasenames})$)(?!.*(?:${escapedAgreementAmendmentsE2eBasenames})$)(?!.*(?:${escapedAttachmentsE2eBasenames})$)(?!.*(?:${escapedAgencyStatusesE2eBasenames})$)(?!.*(?:${escapedFreshResetE2eBasenames})$).*\.spec\.ts$`

export type E2eSuite = 'pglite' | 'postgres' | 'review-scratch' | 'amendment-refresh' | 'agreement-closeout' | 'workflow-recommendation' | 'workflow-setup-retired' | 'agreement-amendments' | 'attachments' | 'agency-statuses' | 'fresh-reset'

export type E2eTestSelection = {
  forwardedPlaywrightArgs: string[]
  suite: E2eSuite
}

type E2eScriptConfig = {
  forwardedPlaywrightArgs: string[]
  suite: E2eSuite
  preferredPort: number
  port: number
  baseUrl: string
  baseUrlFromEnv?: string
  timeoutMs: number
  pgliteDataDir: string
  localFileStorageDir: string
  cleanupDataPaths: () => Promise<void>
  serverMode: 'development' | 'production'
  postgresTestUrl?: string
}

export type ManagedE2eDataPaths = {
  pgliteDataDir: string
  localFileStorageDir: string
  ownsPgliteDataDir: boolean
  ownsLocalFileStorageDir: boolean
  cleanup: () => Promise<void>
}

type PostgresSchemaClient = {
  connect: () => Promise<void>
  query: (queryText: string) => Promise<{ rows?: Array<Record<string, unknown>> }>
  end: () => Promise<void>
}

type PostgresSchemaClientFactory = (connectionString: string) => PostgresSchemaClient

export type PostgresE2eIsolation = {
  connectionString: string
  databaseName: string
  cleanup: () => Promise<void>
}

const createPostgresSchemaClient: PostgresSchemaClientFactory = connectionString =>
  new Client({ connectionString }) as PostgresSchemaClient

type E2eCommandRunner = (command: string[]) => Promise<number>

type ManagedServerProcess = Pick<Bun.Subprocess, 'exited' | 'exitCode' | 'signalCode'>

const runInheritedCommandWithEnv = async (
  command: string[],
  environment: NodeJS.ProcessEnv
): Promise<number> => {
  const subprocess = Bun.spawn(command, {
    cwd: process.cwd(),
    env: environment,
    stdio: ['inherit', 'inherit', 'inherit']
  })
  return await subprocess.exited
}

const runInheritedCommand: E2eCommandRunner = async command =>
  await runInheritedCommandWithEnv(command, process.env)

/**
 * Stages the demo migration required by a development-flavoured production E2E server.
 * Plain production artifacts remain demo-free; this runs only inside the managed test runner.
 *
 * @param serverMode - Managed server mode selected for this E2E run.
 * @param environmentType - Runtime environment flavour passed to the built server.
 * @param runCommand - Command runner used to build the migration bundle.
 * @param outputPath - Destination inside the test-only production artifact.
 * @returns Whether the demo migration was staged.
 */
export const stageManagedProductionDemoMigration = async (
  serverMode: E2eScriptConfig['serverMode'],
  environmentType: string | undefined,
  runCommand: E2eCommandRunner = runInheritedCommand,
  outputPath = '.output/server/demo-migrations/demo.mjs'
): Promise<boolean> => {
  if (serverMode !== 'production' || environmentType !== 'development') return false
  await mkdir(dirname(outputPath), { recursive: true })
  const exitCode = await runCommand(['bun', 'run', 'scripts/build-demo-migration.ts', outputPath])
  if (exitCode !== 0) throw new Error(`Could not stage the demo migration for production E2E (exit ${exitCode}).`)
  return true
}

/**
 * Builds a fresh managed production artifact and then stages its test-only demo migration.
 *
 * @param serverMode - Managed server mode selected for this invocation.
 * @param environmentType - Runtime environment flavour passed to the built server.
 * @param runCommand - Command runner used for both preparation commands.
 * @param outputPath - Test-only demo migration destination.
 * @returns Whether a production artifact was prepared.
 */
export const prepareManagedProductionServer = async (
  serverMode: E2eScriptConfig['serverMode'],
  environmentType: string | undefined,
  runCommand: E2eCommandRunner = runInheritedCommand,
  outputPath = '.output/server/demo-migrations/demo.mjs'
): Promise<boolean> => {
  if (serverMode !== 'production') return false

  const buildExitCode = await runCommand(['bun', 'run', 'build'])
  if (buildExitCode !== 0) {
    throw new Error(`Could not build the managed production E2E server (exit ${buildExitCode}).`)
  }

  await stageManagedProductionDemoMigration(serverMode, environmentType, runCommand, outputPath)
  return true
}

/**
 * Waits for a specified number of milliseconds.
 *
 * @param ms - The number of milliseconds to wait.
 * @returns A promise that resolves after the timeout.
 */
const wait = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const formatManagedServerExit = (process: ManagedServerProcess, exitCode: number): string => {
  if (process.signalCode) {
    return `signal ${process.signalCode} (managed exit ${exitCode})`
  }

  return `exit code ${process.exitCode ?? exitCode}`
}

/**
 * Checks if a host and port can be bound.
 *
 * @param port - The port to check.
 * @param host - The host to check.
 * @returns True if the host and port can be bound, false otherwise.
 */
const canBindHost = async (port: number, host: string): Promise<boolean> => {
  return await new Promise(resolve => {
    const server = createServer()

    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EAFNOSUPPORT') {
        resolve(true)
        return
      }

      resolve(false)
    })
    server.once('listening', () => {
      server.close(() => resolve(true))
    })

    server.listen(port, host)
  })
}

/**
 * Checks if a port is available on localhost.
 *
 * @param port - The port to check.
 * @returns True if the port is available, false otherwise.
 */
const isPortAvailable = async (port: number): Promise<boolean> => {
  const hosts = ['127.0.0.1', '::1']

  for (const host of hosts) {
    const available = await canBindHost(port, host)
    if (!available) {
      return false
    }
  }

  return true
}

/**
 * Finds an available port starting from a preferred port.
 *
 * @param preferredPort - The starting port to check.
 * @param scanLimit - The maximum number of ports to check.
 * @returns The first available port found.
 * @throws Error if no port is found within the scan limit.
 */
const findAvailablePort = async (preferredPort: number, scanLimit: number): Promise<number> => {
  for (let offset = 0; offset <= scanLimit; offset += 1) {
    const candidatePort = preferredPort + offset
    if (await isPortAvailable(candidatePort)) {
      return candidatePort
    }
  }

  throw new Error(`Could not find an available port between ${preferredPort} and ${preferredPort + scanLimit}`)
}

/**
 * Waits for the server to be ready at a given URL.
 *
 * @param url - The URL to check.
 * @param timeoutMs - The timeout in milliseconds.
 * @param serverProcess - Managed server process whose early exit must fail startup.
 * @param fetcher - Health request implementation, overridable for focused tests.
 * @param waiter - Poll-delay implementation, overridable for focused tests.
 * @throws Error if the server is not ready within the timeout.
 */
export const waitForManagedServerReady = async (
  url: string,
  timeoutMs: number,
  serverProcess: ManagedServerProcess,
  fetcher: typeof fetch = fetch,
  waiter: (ms: number) => Promise<void> = wait
): Promise<void> => {
  const startedAt = Date.now()
  const serverExit = serverProcess.exited.then(exitCode => ({ exitCode, kind: 'exit' as const }))
  const throwExitedBeforeReady = (exitCode: number): never => {
    throw new Error(
      `Managed server exited before becoming ready at ${url}: ${formatManagedServerExit(serverProcess, exitCode)}.`
    )
  }

  while (Date.now() - startedAt < timeoutMs) {
    const healthCheck = fetcher(url)
      .then(response => response.ok
        ? { kind: 'ready' as const }
        : { kind: 'unavailable' as const })
      .catch(() => ({ kind: 'unavailable' as const }))
    const healthOrExit = await Promise.race([healthCheck, serverExit])

    if (healthOrExit.kind === 'exit') {
      throwExitedBeforeReady(healthOrExit.exitCode)
    }
    if (healthOrExit.kind === 'ready') {
      const ownershipCheck = await Promise.race([
        serverExit,
        new Promise<{ kind: 'running' }>(resolve => setImmediate(() => resolve({ kind: 'running' })))
      ])
      if (ownershipCheck.kind === 'exit') throwExitedBeforeReady(ownershipCheck.exitCode)
      if (serverProcess.exitCode !== null) throwExitedBeforeReady(serverProcess.exitCode)
      return
    }

    const waitOrExit = await Promise.race([
      waiter(500).then(() => ({ kind: 'waited' as const })),
      serverExit
    ])
    if (waitOrExit.kind === 'exit') {
      throwExitedBeforeReady(waitOrExit.exitCode)
    }
  }

  throw new Error(`Timed out waiting for managed server at ${url}`)
}

const readSpecArg = (rawArgs: string[], index: number): string => {
  const nextArg = rawArgs[index + 1]

  if (!nextArg || nextArg.startsWith('-')) {
    throw new Error('Missing value for --spec. Example: bun run test:e2e:light --spec tests/e2e/foo.spec.ts')
  }

  return nextArg
}

const readSuiteArg = (rawArgs: string[], index: number): E2eSuite => {
  const nextArg = rawArgs[index + 1]
  if (nextArg === 'pglite' || nextArg === 'postgres' || nextArg === 'review-scratch' || nextArg === 'amendment-refresh' || nextArg === 'agreement-closeout' || nextArg === 'workflow-recommendation' || nextArg === 'workflow-setup-retired' || nextArg === 'agreement-amendments' || nextArg === 'attachments' || nextArg === 'agency-statuses' || nextArg === 'fresh-reset') return nextArg
  throw new Error('Missing or invalid value for --suite. Expected a declared managed E2E suite.')
}

const PLAYWRIGHT_OPTIONS_WITH_VALUES = new Set([
  '--config',
  '--global-timeout',
  '--grep',
  '--grep-invert',
  '--max-failures',
  '--output',
  '--project',
  '--repeat-each',
  '--reporter',
  '--retries',
  '--shard',
  '--test-list',
  '--test-list-invert',
  '--timeout',
  '--tsconfig',
  '--update-snapshots',
  '--update-source-method',
  '--workers'
])

const assertCanonicalExistingSpecPath = (selectedSpec: string): void => {
  if (
    isAbsolute(selectedSpec) ||
    !selectedSpec.startsWith('tests/e2e/') ||
    selectedSpec.includes('\\') ||
    selectedSpec.includes('/../') ||
    selectedSpec.includes('/./') ||
    selectedSpec !== selectedSpec.trim() ||
    !selectedSpec.endsWith('.spec.ts')
  ) {
    throw new Error('--spec requires an exact repository-relative tests/e2e/*.spec.ts file path.')
  }

  const absoluteSpec = resolve(process.cwd(), selectedSpec)
  try {
    const physicalE2eRoot = realpathSync(resolve(process.cwd(), 'tests/e2e'))
    const physicalSpec = realpathSync(absoluteSpec)
    const relativePhysicalSpec = relative(physicalE2eRoot, physicalSpec)
    if (
      !statSync(absoluteSpec).isFile() ||
      relativePhysicalSpec.startsWith('..') ||
      isAbsolute(relativePhysicalSpec)
    ) {
      throw new Error('not a canonical regular file')
    }
  } catch {
    throw new Error(`--spec file does not exist as a canonical regular file: ${selectedSpec}`)
  }
}

const assertSpecBelongsToSuite = (suite: E2eSuite, selectedSpec: string): void => {
  assertCanonicalExistingSpecPath(selectedSpec)
  const isReviewScratchSpec = selectedSpec.endsWith('.tmp.spec.ts')
  const isPostgresSpec = postgresE2eSpecPaths.some(path => path === selectedSpec)
  const isAmendmentRefreshSpec = amendmentRefreshE2eSpecPaths.some(path => path === selectedSpec)
  const isAgreementCloseoutSpec = agreementCloseoutE2eSpecPaths.some(path => path === selectedSpec)
  const isWorkflowRecommendationSpec = workflowRecommendationE2eSpecPaths.some(path => path === selectedSpec)
  const isWorkflowSetupRetiredSpec = workflowSetupRetiredE2eSpecPaths.some(path => path === selectedSpec)
  const isAgreementAmendmentsSpec = agreementAmendmentsE2eSpecPaths.some(path => path === selectedSpec)
  const isAttachmentsSpec = attachmentsE2eSpecPaths.some(path => path === selectedSpec)
  const isAgencyStatusesSpec = agencyStatusesE2eSpecPaths.some(path => path === selectedSpec)
  const isFreshResetSpec = freshResetE2eSpecPaths.some(path => path === selectedSpec)

  if (suite === 'review-scratch' && !isReviewScratchSpec) {
    throw new Error('The review-scratch suite accepts only *.tmp.spec.ts files.')
  }
  if (suite === 'postgres' && !isPostgresSpec) {
    throw new Error('The postgres suite accepts only the seven managed PostgreSQL E2E specs.')
  }
  if (suite === 'amendment-refresh' && !isAmendmentRefreshSpec) {
    throw new Error('The amendment-refresh suite accepts only its exact managed Amendment refresh spec.')
  }
  if (suite === 'agreement-closeout' && !isAgreementCloseoutSpec) {
    throw new Error('The agreement-closeout suite accepts only its exact managed Closeout spec.')
  }
  if (suite === 'workflow-recommendation' && !isWorkflowRecommendationSpec) {
    throw new Error('The workflow-recommendation suite accepts only its exact managed Workflow Recommendation spec.')
  }
  if (suite === 'workflow-setup-retired' && !isWorkflowSetupRetiredSpec) {
    throw new Error('The workflow-setup-retired suite accepts only its exact managed retired Workflow Setup spec.')
  }
  if (suite === 'agreement-amendments' && !isAgreementAmendmentsSpec) {
    throw new Error('The agreement-amendments suite accepts only its exact managed Agreement Amendments spec.')
  }
  if (suite === 'attachments' && !isAttachmentsSpec) {
    throw new Error('The attachments suite accepts only its exact managed Attachments spec.')
  }
  if (suite === 'agency-statuses' && !isAgencyStatusesSpec) {
    throw new Error('The agency-statuses suite accepts only its exact managed Agency Statuses spec.')
  }
  if (suite === 'fresh-reset' && !isFreshResetSpec) {
    throw new Error('The fresh-reset suite accepts only its exact managed shared-seed mutation specs.')
  }
  if (suite === 'pglite' && isReviewScratchSpec) {
    throw new Error('Temporary review specs require bun run test:e2e:review-scratch:spec -- <spec>.')
  }
  if (suite === 'pglite' && isPostgresSpec) {
    throw new Error('PostgreSQL-only specs require bun run test:e2e:postgres:spec -- <spec>.')
  }
  if (suite === 'pglite' && isAmendmentRefreshSpec) {
    throw new Error('The isolated Amendment refresh spec requires bun run test:e2e:amendment-refresh.')
  }
  if (suite === 'pglite' && isAgreementCloseoutSpec) {
    throw new Error('The isolated Closeout spec requires bun run test:e2e:agreement-closeout.')
  }
  if (suite === 'pglite' && isWorkflowRecommendationSpec) {
    throw new Error('The isolated Workflow Recommendation spec requires bun run test:e2e:workflow-recommendation.')
  }
  if (suite === 'pglite' && isWorkflowSetupRetiredSpec) {
    throw new Error('The isolated retired Workflow Setup spec requires bun run test:e2e:workflow-setup-retired.')
  }
  if (suite === 'pglite' && isAgreementAmendmentsSpec) {
    throw new Error('The isolated Agreement Amendments spec requires bun run test:e2e:agreement-amendments.')
  }
  if (suite === 'pglite' && isAttachmentsSpec) {
    throw new Error('The isolated Attachments spec requires bun run test:e2e:attachments.')
  }
  if (suite === 'pglite' && isAgencyStatusesSpec) {
    throw new Error('The isolated Agency Statuses spec requires bun run test:e2e:agency-statuses.')
  }
  if (suite === 'pglite' && isFreshResetSpec) {
    throw new Error('Shared-seed mutation specs require bun run test:e2e:fresh-reset:spec -- <spec>.')
  }
}

/**
 * Resolves the managed E2E suite and Playwright file selectors.
 *
 * @param rawArgs - Arguments supplied to the managed runner.
 * @param specFromEnv - Optional focused spec supplied through E2E_SPEC.
 * @returns The selected suite and arguments forwarded to Playwright.
 */
export const resolveE2eTestSelection = (rawArgs: string[], specFromEnv?: string): E2eTestSelection => {
  const forwardedPlaywrightArgs: string[] = []
  let specFromArg: string | undefined
  let suite: E2eSuite | undefined

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index]

    if (arg.startsWith('--spec=') || arg.startsWith('--suite=')) {
      throw new Error(`${arg.split('=')[0]} requires its value as the next argument.`)
    }

    if (arg === '--spec') {
      if (specFromArg !== undefined) throw new Error('--spec may be supplied only once.')
      specFromArg = readSpecArg(rawArgs, index)
      index += 1
      continue
    }

    if (arg === '--suite') {
      if (suite !== undefined) throw new Error('--suite may be supplied only once.')
      suite = readSuiteArg(rawArgs, index)
      index += 1
      continue
    }

    if (arg === '--pass-with-no-tests' || arg.startsWith('--pass-with-no-tests=')) {
      throw new Error('--pass-with-no-tests is forbidden because an empty managed E2E selection must fail.')
    }

    if (!arg.startsWith('-')) {
      throw new Error(`Positional E2E file filters are forbidden (${arg}); select one exact file with --spec.`)
    }

    forwardedPlaywrightArgs.push(arg)
    if (PLAYWRIGHT_OPTIONS_WITH_VALUES.has(arg)) {
      const optionValue = rawArgs[index + 1]
      if (!optionValue || optionValue.startsWith('-')) {
        throw new Error(`Missing value for Playwright option ${arg}.`)
      }
      forwardedPlaywrightArgs.push(optionValue)
      index += 1
    }
  }

  if (specFromArg && specFromEnv) {
    throw new Error('Use either --spec or E2E_SPEC, not both.')
  }

  const selectedSuite = suite ?? 'pglite'
  const selectedSpec = specFromArg ?? specFromEnv
  if (selectedSuite === 'fresh-reset' && !selectedSpec) {
    throw new Error('The fresh-reset runner requires one exact --spec; use bun run test:e2e:fresh-reset for all fresh-reset specs.')
  }
  if (selectedSpec) {
    assertSpecBelongsToSuite(selectedSuite, selectedSpec)
    forwardedPlaywrightArgs.push(selectedSpec)
  } else if (selectedSuite === 'postgres') {
    forwardedPlaywrightArgs.push(...postgresE2eSpecPaths)
  } else if (selectedSuite === 'review-scratch') {
    forwardedPlaywrightArgs.push(reviewScratchE2eFilePattern)
  } else if (selectedSuite === 'amendment-refresh') {
    forwardedPlaywrightArgs.push(...amendmentRefreshE2eSpecPaths)
  } else if (selectedSuite === 'agreement-closeout') {
    forwardedPlaywrightArgs.push(...agreementCloseoutE2eSpecPaths)
  } else if (selectedSuite === 'workflow-recommendation') {
    forwardedPlaywrightArgs.push(...workflowRecommendationE2eSpecPaths)
  } else if (selectedSuite === 'workflow-setup-retired') {
    forwardedPlaywrightArgs.push(...workflowSetupRetiredE2eSpecPaths)
  } else if (selectedSuite === 'agreement-amendments') {
    forwardedPlaywrightArgs.push(...agreementAmendmentsE2eSpecPaths)
  } else if (selectedSuite === 'attachments') {
    forwardedPlaywrightArgs.push(...attachmentsE2eSpecPaths)
  } else if (selectedSuite === 'agency-statuses') {
    forwardedPlaywrightArgs.push(...agencyStatusesE2eSpecPaths)
  } else {
    forwardedPlaywrightArgs.push(pgliteE2eFilePattern)
  }

  return { forwardedPlaywrightArgs, suite: selectedSuite }
}

/**
 * Validates the dedicated disposable database URL for managed PostgreSQL E2E.
 *
 * @param environment - Environment containing E2E_POSTGRES_TEST_URL.
 * @returns The validated PostgreSQL URL.
 */
export const requireDisposableE2ePostgresUrl = (environment: NodeJS.ProcessEnv): string => {
  const value = environment[E2E_POSTGRES_TEST_URL_ENV]?.trim()
  if (!value) {
    throw new Error(`${E2E_POSTGRES_TEST_URL_ENV} is required for the PostgreSQL E2E suite.`)
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${E2E_POSTGRES_TEST_URL_ENV} must be a valid PostgreSQL URL.`)
  }

  const databaseName = decodeURIComponent(url.pathname).split('/').filter(Boolean).at(-1) ?? ''
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !databaseName.endsWith('_test')) {
    throw new Error(`${E2E_POSTGRES_TEST_URL_ENV} must be a PostgreSQL URL whose database name ends in _test.`)
  }

  return value
}

const POSTGRES_E2E_LOCK_QUERY = 'SELECT pg_try_advisory_lock(hashtext(\'gcs-ssc-managed-e2e\')) AS acquired'
const POSTGRES_E2E_UNLOCK_QUERY = 'SELECT pg_advisory_unlock(hashtext(\'gcs-ssc-managed-e2e\'))'

const resetPostgresE2eSchemas = async (client: PostgresSchemaClient): Promise<void> => {
  await client.query('DROP SCHEMA IF EXISTS extensions CASCADE')
  await client.query('DROP SCHEMA IF EXISTS public CASCADE')
  await client.query('CREATE SCHEMA public')
}

/**
 * Locks and resets application-owned schemas inside an explicitly disposable PostgreSQL database.
 *
 * @param postgresTestUrl - Validated disposable PostgreSQL URL.
 * @param clientFactory - PostgreSQL client factory, overridable for focused tests.
 * @returns Locked connection URL and cleanup callback.
 */
export const createPostgresE2eIsolation = async (
  postgresTestUrl: string,
  clientFactory: PostgresSchemaClientFactory = createPostgresSchemaClient
): Promise<PostgresE2eIsolation> => {
  requireDisposableE2ePostgresUrl({ [E2E_POSTGRES_TEST_URL_ENV]: postgresTestUrl })
  const url = new URL(postgresTestUrl)
  const databaseName = decodeURIComponent(url.pathname).split('/').filter(Boolean).at(-1) ?? ''
  url.searchParams.delete('options')
  const connectionString = url.toString()
  const client = clientFactory(connectionString)
  let lockHeld = false
  try {
    await client.connect()
    const lockResult = await client.query(POSTGRES_E2E_LOCK_QUERY)
    if (lockResult.rows?.[0]?.acquired !== true) {
      throw new Error(`Another managed E2E run is already using PostgreSQL database ${databaseName}.`)
    }
    lockHeld = true
    await resetPostgresE2eSchemas(client)
  } catch (error) {
    try {
      if (lockHeld) await client.query(POSTGRES_E2E_UNLOCK_QUERY)
    } finally {
      await client.end()
    }
    throw error
  }

  let cleanedUp = false

  return {
    connectionString,
    databaseName,
    cleanup: async () => {
      if (cleanedUp) return
      cleanedUp = true
      try {
        await resetPostgresE2eSchemas(client)
      } finally {
        try {
          await client.query(POSTGRES_E2E_UNLOCK_QUERY)
        } finally {
          await client.end()
        }
      }
    }
  }
}

const getNumberProcessEnvValue = (key: string, fallback: number): number => {
  const value = process.env[key]
  const parsed = value ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

const getProcessEnvValue = (key: string, fallback: string): string => process.env[key] || fallback

/**
 * Resolves isolated data paths for a managed E2E run.
 * Caller-provided paths are preserved and never removed by the runner.
 *
 * @param environment - Environment containing optional data-path overrides.
 * @param temporaryRoot - Root used for runner-owned temporary directories.
 * @returns Resolved paths, ownership metadata, and idempotent cleanup.
 */
export const createManagedE2eDataPaths = async (
  environment: NodeJS.ProcessEnv = process.env,
  temporaryRoot = tmpdir()
): Promise<ManagedE2eDataPaths> => {
  const providedPgliteDataDir = environment.PGLITE_DATA_DIR
  const providedLocalFileStorageDir = environment.GCS_LOCAL_FILE_STORAGE_DIR
  let ownedPgliteDataDir: string | undefined
  let ownedLocalFileStorageDir: string | undefined

  try {
    if (!providedPgliteDataDir) {
      ownedPgliteDataDir = await mkdtemp(join(temporaryRoot, DEFAULT_PGLITE_DATA_DIR_PREFIX))
    }
    if (!providedLocalFileStorageDir) {
      ownedLocalFileStorageDir = await mkdtemp(join(temporaryRoot, DEFAULT_LOCAL_FILE_STORAGE_DIR_PREFIX))
    }
  } catch (error) {
    await Promise.all([
      ownedPgliteDataDir ? rm(ownedPgliteDataDir, { recursive: true, force: true }) : Promise.resolve(),
      ownedLocalFileStorageDir
        ? rm(ownedLocalFileStorageDir, { recursive: true, force: true })
        : Promise.resolve()
    ])
    throw error
  }

  const pgliteDataDir = providedPgliteDataDir || ownedPgliteDataDir
  const localFileStorageDir = providedLocalFileStorageDir || ownedLocalFileStorageDir
  if (!pgliteDataDir || !localFileStorageDir) {
    throw new Error('Managed E2E data paths could not be resolved.')
  }

  let cleanedUp = false
  return {
    pgliteDataDir,
    localFileStorageDir,
    ownsPgliteDataDir: ownedPgliteDataDir !== undefined,
    ownsLocalFileStorageDir: ownedLocalFileStorageDir !== undefined,
    cleanup: async () => {
      if (cleanedUp) return
      cleanedUp = true
      await Promise.all([
        ownedPgliteDataDir ? rm(ownedPgliteDataDir, { recursive: true, force: true }) : Promise.resolve(),
        ownedLocalFileStorageDir
          ? rm(ownedLocalFileStorageDir, { recursive: true, force: true })
          : Promise.resolve()
      ])
    }
  }
}

const resolveE2ePort = async (
  baseUrlFromEnv: string | undefined,
  preferredPort: number
): Promise<number> => {
  if (baseUrlFromEnv) {
    const url = new URL(baseUrlFromEnv)
    return Number(url.port || (url.protocol === 'https:' ? 443 : 80))
  }

  return await findAvailablePort(preferredPort, DEFAULT_PORT_SCAN_LIMIT)
}

const resolveBaseUrl = (baseUrlFromEnv: string | undefined, port: number): string =>
  baseUrlFromEnv || `http://localhost:${port}`

/**
 * Uses a single-owner production process for every PGlite-backed managed suite.
 * PostgreSQL remains safe under Nitro development-worker turnover.
 *
 * @param suite - Managed test suite.
 * @param requestedMode - Optional explicit server mode override.
 * @returns Safe managed server mode for the suite.
 */
export const resolveManagedE2eServerMode = (
  suite: E2eSuite,
  requestedMode: string | undefined
): E2eScriptConfig['serverMode'] => suite === 'postgres' && requestedMode !== 'production'
  ? 'development'
  : 'production'

export const managedE2eRequiresNuxtArtifactLock = (
  suite: E2eSuite,
  requestedMode: string | undefined
): boolean => resolveManagedE2eServerMode(suite, requestedMode) === 'production'

const resolveE2eScriptConfig = async (): Promise<E2eScriptConfig> => {
  const selection = resolveE2eTestSelection(process.argv.slice(2), process.env.E2E_SPEC?.trim())
  const preferredPort = getNumberProcessEnvValue('E2E_PORT', DEFAULT_PORT)
  const baseUrlFromEnv = process.env.PLAYWRIGHT_BASE_URL
  const port = await resolveE2ePort(baseUrlFromEnv, preferredPort)
  const baseUrl = resolveBaseUrl(baseUrlFromEnv, port)
  const timeoutMs = getNumberProcessEnvValue('E2E_SERVER_WAIT_MS', DEFAULT_WAIT_TIMEOUT_MS)
  const serverMode = resolveManagedE2eServerMode(selection.suite, process.env.E2E_SERVER_MODE)
  const postgresTestUrl = selection.suite === 'postgres'
    ? requireDisposableE2ePostgresUrl(process.env)
    : undefined
  const dataPaths = await createManagedE2eDataPaths()

  return {
    forwardedPlaywrightArgs: selection.forwardedPlaywrightArgs,
    suite: selection.suite,
    preferredPort,
    port,
    baseUrl,
    baseUrlFromEnv,
    timeoutMs,
    pgliteDataDir: dataPaths.pgliteDataDir,
    localFileStorageDir: dataPaths.localFileStorageDir,
    cleanupDataPaths: dataPaths.cleanup,
    serverMode,
    ...(postgresTestUrl ? { postgresTestUrl } : {})
  }
}

const buildE2eEnv = (
  baseUrl: string,
  pgliteDataDir: string,
  localFileStorageDir: string,
  suite: E2eSuite,
  postgresConnectionString?: string
): NodeJS.ProcessEnv => {
  const env = {
    ...process.env,
    PGLITE_DATA_DIR: pgliteDataDir,
    GCS_LOCAL_FILE_STORAGE_DIR: localFileStorageDir,
    BETTER_AUTH_SECRET: getProcessEnvValue('BETTER_AUTH_SECRET', DEFAULT_AUTH_SECRET),
    BETTER_AUTH_URL: getProcessEnvValue('BETTER_AUTH_URL', baseUrl),
    BETTER_AUTH_TRUSTED_ORIGINS: getProcessEnvValue('BETTER_AUTH_TRUSTED_ORIGINS', baseUrl),
    BETTER_AUTH_DISABLE_LOGGER: getProcessEnvValue('BETTER_AUTH_DISABLE_LOGGER', 'true'),
    NUXT_DISABLE_SOURCEMAPS: getProcessEnvValue('NUXT_DISABLE_SOURCEMAPS', 'true'),
    ENVIRONMENT_TYPE: getProcessEnvValue('ENVIRONMENT_TYPE', 'development'),
    PLAYWRIGHT_WORKERS: getProcessEnvValue('PLAYWRIGHT_WORKERS', DEFAULT_PLAYWRIGHT_WORKERS)
  }
  Object.assign(env, { GCS_E2E_SUITE: suite, GCS_E2E_SERVER_MODE: resolveManagedE2eServerMode(suite, process.env.E2E_SERVER_MODE) })
  if (suite === 'agreement-amendments') Object.assign(env, { E2E_ISOLATED_AMENDMENT_AGREEMENT: '1' })
  delete env.DATABASE_URL
  delete env.NUXT_DATABASE_URL
  delete env.E2E_POSTGRES_TEST_URL
  delete env.PGOPTIONS
  delete env.NO_COLOR

  if (suite === 'postgres') {
    if (!postgresConnectionString) throw new Error('PostgreSQL E2E isolation was not prepared.')
    env.DATABASE_URL = postgresConnectionString
  }
  if (suite === 'review-scratch') {
    env.E2E_REVIEW_SCRATCH = '1'
  } else {
    delete env.E2E_REVIEW_SCRATCH
  }

  return env
}

const logPortSelection = (config: E2eScriptConfig): void => {
  if (!config.baseUrlFromEnv && config.port !== config.preferredPort) {
    console.info(`[e2e] Port ${config.preferredPort} is in use. Using port ${config.port}.`)
  }
}

/**
 * Resolves the directly owned server command for managed cleanup.
 *
 * @param port - Managed development-server port.
 * @param serverMode - Selected managed server mode.
 * @returns Direct child command for the runner.
 */
export const buildManagedServerCommand = (
  port: number,
  serverMode: E2eScriptConfig['serverMode']
): string[] => serverMode === 'production'
  ? ['node', '.output/server/index.mjs']
  : ['bun', 'run', 'scripts/dev.ts', '--no-fork', '--port', String(port)]

const spawnManagedServer = (
  port: number,
  env: NodeJS.ProcessEnv,
  serverMode: E2eScriptConfig['serverMode']
): Bun.Subprocess =>
  Bun.spawn(buildManagedServerCommand(port, serverMode), {
    cwd: process.cwd(),
    env: { ...env, PORT: String(port) },
    stdio: ['inherit', 'inherit', 'inherit']
  })

const spawnPlaywright = (
  forwardedPlaywrightArgs: string[],
  baseUrl: string,
  env: NodeJS.ProcessEnv
): Bun.Subprocess => Bun.spawn(['bun', 'x', 'playwright', 'test', ...forwardedPlaywrightArgs], {
  cwd: process.cwd(),
  env: {
    ...env,
    PLAYWRIGHT_BASE_URL: baseUrl
  },
  stdio: ['inherit', 'inherit', 'inherit']
})

const createProcessCleanup = (
  devProcess: Bun.Subprocess,
  getE2eProcess: () => Bun.Subprocess | undefined,
  additionalCleanup?: () => Promise<void>
) => {
  let cleanedUp = false

  return async (): Promise<void> => {
    if (cleanedUp) {
      return
    }
    cleanedUp = true

    const e2eProcess = getE2eProcess()
    e2eProcess?.kill()
    devProcess.kill()

    await Promise.allSettled([e2eProcess?.exited, devProcess.exited].filter(Boolean))
    await additionalCleanup?.()
  }
}

const registerCleanupSignals = (cleanup: () => Promise<void>): {
  handleSigint: () => void
  handleSigterm: () => void
} => {
  const onSignal = (signal: NodeJS.Signals): void => {
    void cleanup().finally(() => {
      process.exit(signal === 'SIGINT' ? 130 : 143)
    })
  }
  const handleSigint = (): void => onSignal('SIGINT')
  const handleSigterm = (): void => onSignal('SIGTERM')

  process.once('SIGINT', handleSigint)
  process.once('SIGTERM', handleSigterm)

  return { handleSigint, handleSigterm }
}

const runE2eTests = async (
  config: E2eScriptConfig,
  env: NodeJS.ProcessEnv,
  additionalCleanup?: () => Promise<void>
): Promise<void> => {
  const devProcess = spawnManagedServer(config.port, env, config.serverMode)
  let e2eProcess: Bun.Subprocess | undefined
  const cleanup = createProcessCleanup(devProcess, () => e2eProcess, additionalCleanup)
  const { handleSigint, handleSigterm } = registerCleanupSignals(cleanup)

  try {
    await waitForManagedServerReady(`${config.baseUrl}/api/health`, config.timeoutMs, devProcess)
    e2eProcess = spawnPlaywright(config.forwardedPlaywrightArgs, config.baseUrl, env)
    process.exitCode = await e2eProcess.exited
  } finally {
    process.off('SIGINT', handleSigint)
    process.off('SIGTERM', handleSigterm)
    await cleanup()
  }
}

/**
 * Main entry point for the e2e test script.
 */
const main = async (): Promise<void> => {
  const rawArgs = process.argv.slice(2)
  const selection = resolveE2eTestSelection(rawArgs, process.env.E2E_SPEC?.trim())
  if (
    managedE2eRequiresNuxtArtifactLock(selection.suite, process.env.E2E_SERVER_MODE) &&
    process.env[NUXT_ARTIFACT_LOCK_ENV] !== '1'
  ) {
    process.exitCode = await runWithNuxtArtifactLock([
      process.execPath,
      fileURLToPath(import.meta.url),
      ...rawArgs
    ])
    return
  }

  const config = await resolveE2eScriptConfig()
  logPortSelection(config)

  let postgresIsolation: PostgresE2eIsolation | undefined
  const cleanupManagedResources = async (): Promise<void> => {
    const results = await Promise.allSettled([
      postgresIsolation?.cleanup(),
      config.cleanupDataPaths()
    ])
    const failure = results.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
  }

  try {
    if (config.postgresTestUrl) {
      postgresIsolation = await createPostgresE2eIsolation(config.postgresTestUrl)
      console.info(`[e2e] Reset and exclusively locked disposable PostgreSQL database ${postgresIsolation.databaseName}.`)
    }

    const env = buildE2eEnv(
      config.baseUrl,
      config.pgliteDataDir,
      config.localFileStorageDir,
      config.suite,
      postgresIsolation?.connectionString
    )
    await prepareManagedProductionServer(
      config.serverMode,
      env.ENVIRONMENT_TYPE,
      command => runInheritedCommandWithEnv(command, env)
    )
    await runE2eTests(config, env, cleanupManagedResources)
  } finally {
    await cleanupManagedResources()
  }
}

if (import.meta.main) await main()
