import { securityRemediationPostgresE2eSpecPaths } from '../tooling/gcs-ssc/scripts/security-remediation-e2e-specs'
/* eslint-disable jsdoc/require-jsdoc */
import { randomBytes } from 'node:crypto'
import { realpathSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { NUXT_ARTIFACT_LOCK_ENV, runWithNuxtArtifactLock } from './nuxt-artifact-lock'
import { observeManagedServerOutput, parseManagedClientUrl, waitForManagedServerReady } from './managed-e2e-readiness'
import type { ManagedServerListening } from './managed-e2e-readiness'

const DEFAULT_PORT = 3005
const DEFAULT_WAIT_TIMEOUT_MS = 60_000
const DEFAULT_PGLITE_DATA_DIR_PREFIX = 'gcs-ssc-pglite-e2e-'
const DEFAULT_LOCAL_FILE_STORAGE_DIR_PREFIX = 'gcs-ssc-files-e2e-'
const DEFAULT_AUTH_SECRET = ['abcdefghijklmnopqrstuvwxyz', '123456'].join('')
const DEFAULT_PORT_SCAN_LIMIT = 50
const DEFAULT_PLAYWRIGHT_WORKERS = '1'
const E2E_POSTGRES_TEST_URL_ENV = 'E2E_POSTGRES_TEST_URL'
const E2E_ACCESS_POSTGRES_TEST_URL_ENV = 'E2E_ACCESS_POSTGRES_TEST_URL'

const hostileDeepLinksE2eSpecPath = 'tests/e2e/hostile-deep-links.spec.ts'

export const extensionProfileE2eSpecPath = 'tests/e2e/agreement-extension-persistence.spec.ts'
export const notificationEditorE2eSpecPath = 'tests/e2e/notification-provider-editor-host.spec.ts'

export const postgresE2eSpecPaths = [
  ...securityRemediationPostgresE2eSpecPaths,
  'tests/e2e/stream-wizard-budget-reference-review.spec.ts',
  'tests/e2e/proponent-profile-list-review.spec.ts',
  'tests/e2e/proponent-profile-historical-subtype-update-review.spec.ts',
  'tests/e2e/stream-eligible-recipients-update-review.spec.ts',
  'tests/e2e/stream-eligible-recipients-list-review.spec.ts',
  'tests/e2e/agreement-budget-legacy-fiscal-year.spec.ts',
  'tests/e2e/agreement-financial-summary-lineage.spec.ts',
  'tests/e2e/agreement-financial-summary-postgres.spec.ts',
  'tests/e2e/agreement-activity-readonly-lock.spec.ts',
  'tests/e2e/agreement-address-readonly-lock.spec.ts',
  'tests/e2e/agreement-address-review.spec.ts',
  'tests/e2e/agreement-budget-terminal-lock.spec.ts',
  'tests/e2e/agreement-child-id-search-boundaries.spec.ts',
  'tests/e2e/agreement-proponent-relationships.spec.ts',
  'tests/e2e/applicant-recipient-cross-agency.spec.ts',
  'tests/e2e/transfer-payment-stream-identity.spec.ts',
  'tests/e2e/program-budget-legacy-fiscal-year.spec.ts',
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

export const lifecycleFixturePgliteE2eSpecPaths = [
  'tests/e2e/health-canada-reconciliation-terminal-config.spec.ts',
  'tests/e2e/agreement-activity-duration.spec.ts',
  'tests/e2e/casework-help-catalog.spec.ts',
  'tests/e2e/agency-address-type-review.spec.ts',
  'tests/e2e/agreement-activity-relationship-lookup.spec.ts',
  'tests/e2e/agreement-address-mutations-review.spec.ts',
  'tests/e2e/agreement-budget-activity-scroll.spec.ts',
  'tests/e2e/agreement-budget-core.spec.ts',
  'tests/e2e/agreement-budget-financial-limits.spec.ts',
  'tests/e2e/agreement-budget-fiscal-year-review.spec.ts',
  'tests/e2e/agreement-claim-answer-concurrency.spec.ts',
  'tests/e2e/agreement-claim-completion-presentation.spec.ts',
  'tests/e2e/agreement-claim-core.spec.ts',
  'tests/e2e/agreement-requests.spec.ts',
  'tests/e2e/claim-structured-custom-fields.spec.ts',
  'tests/e2e/agreement-custom-fields-seed.spec.ts',
  'tests/e2e/agreement-custom-fields.spec.ts',
  'tests/e2e/agreement-delete-review.spec.ts',
  'tests/e2e/agreement-detail-review.spec.ts',
  'tests/e2e/agreement-document-ui.spec.ts',
  'tests/e2e/agreement-financial-budget-controls.spec.ts',
  'tests/e2e/agreement-forecast-claim-funding.spec.ts',
  'tests/e2e/agreement-forecast-core.spec.ts',
  'tests/e2e/agreement-forecast-grouping.spec.ts',
  'tests/e2e/agreement-forecast-monthly-recovery.spec.ts',
  'tests/e2e/agreement-list-review.spec.ts',
  'tests/e2e/agreement-monitor-lifecycle.spec.ts',
  'tests/e2e/agreement-monitor-pending-actions.spec.ts',
  'tests/e2e/agreement-payments-tab-selection.spec.ts',
  'tests/e2e/agreement-payments.spec.ts',
  'tests/e2e/agreement-proponent-create-review.spec.ts',
  'tests/e2e/agreement-proponent-lookup-review.spec.ts',
  'tests/e2e/agreement-proponent-read-review.spec.ts',
  'tests/e2e/agreement-proponent-update-review.spec.ts',
  'tests/e2e/agreement-relationships.spec.ts',
  'tests/e2e/agreement-clauses.spec.ts',
  'tests/e2e/review-agreement-clauses.spec.ts',
  'tests/e2e/review-clause-adversarial-finality.spec.ts',
  'tests/e2e/review-clause-adversarial-permissions.spec.ts',
  'tests/e2e/review-clause-adversarial-submission.spec.ts',
  'tests/e2e/review-clause-assessment.spec.ts',
  'tests/e2e/related-proponents.spec.ts',
  'tests/e2e/agreement-update-review.spec.ts',
  'tests/e2e/agreements.spec.ts',
  'tests/e2e/amendment-document-ui.spec.ts',
  'tests/e2e/assigned-work-deleted-owner.spec.ts',
  'tests/e2e/assigned-users-group-retry.spec.ts',
  'tests/e2e/assignment-management.spec.ts',
  'tests/e2e/attachment-member-ids.spec.ts',
  'tests/e2e/budget-percentage.spec.ts',
  'tests/e2e/composed-financial-spine.spec.ts',
  'tests/e2e/correction-lifecycle.spec.ts',
  'tests/e2e/cost-category-availability.spec.ts',
  'tests/e2e/stream-cost-visibility.spec.ts',
  'tests/e2e/custom-field-namespace-crud.spec.ts',
  'tests/e2e/document-docx-generation.spec.ts',
  'tests/e2e/document-generation-failures.spec.ts',
  'tests/e2e/entity-assignment-context-review.spec.ts',
  'tests/e2e/entity-reviews-tabs.spec.ts',
  'tests/e2e/exact-roster-worker-approver-handoff.spec.ts',
  'tests/e2e/forecast-historical-budget-read.spec.ts',
  'tests/e2e/forecast-role-recovery.spec.ts',
  'tests/e2e/funding-source-retained-budget.spec.ts',
  hostileDeepLinksE2eSpecPath,
  'tests/e2e/journal-vouchers.spec.ts',
  'tests/e2e/monitor-historical-reference.spec.ts',
  'tests/e2e/review-group-claim-clone-caller.spec.ts',
  'tests/e2e/lifecycle-approval-helper-outcomes.spec.ts',
  'tests/e2e/qualified-assignment-route-review.spec.ts',
  'tests/e2e/stream-agreement-subtypes-delete-review.spec.ts',
  'tests/e2e/stream-agreement-subtypes-update-reference-review.spec.ts',
  'tests/e2e/stream-holdback-bases-delete-review.spec.ts',
  'tests/e2e/stream-holdback-bases-update-referenced-review.spec.ts',
  'tests/e2e/transfer-payment-amendment-subtypes.spec.ts',
  'tests/e2e/workflow-amendment-conditions.spec.ts',
  'tests/e2e/workflow-group-owners.spec.ts',
  'tests/e2e/workflow-profile-conditions.spec.ts',
  'tests/e2e/workflow-result-conditions.spec.ts',
  'tests/e2e/maple-finance-ready.spec.ts',
  'tests/e2e/additional-reviewer-lookup-review.spec.ts',
  'tests/e2e/checklist-load-recovery.spec.ts',
  'tests/e2e/supplementary-information.spec.ts',
  'tests/e2e/workflow-data-collection-inline.spec.ts'
] as const

export const freshResetE2eSpecPaths = [
  'tests/e2e/lifecycle-helper-capacity-isolation.spec.ts',
  ...lifecycleFixturePgliteE2eSpecPaths,
  'tests/e2e/ncia-demo-seed.spec.ts',
  'tests/e2e/account-receivable-claim-reductions.spec.ts',
  'tests/e2e/account-receivable-create-claim.spec.ts',
  'tests/e2e/account-receivable-errors.spec.ts',
  'tests/e2e/account-receivable-source-action-review.spec.ts',
  'tests/e2e/three-role-contribution-journey.spec.ts',
  'tests/e2e/agency-publication-authoring.spec.ts',
  'tests/e2e/data-collection-workflow.spec.ts',
  'tests/e2e/advance-direct-repayment-hold.spec.ts',
  'tests/e2e/payment-debt-override.spec.ts',
  'tests/e2e/payment-offset-coding-wizard.spec.ts',
  'tests/e2e/payment-accounting-boundaries.spec.ts',
  'tests/e2e/claim-overview-read-recovery.spec.ts',
  'tests/e2e/commitment-coding-uniqueness.spec.ts',
  'tests/e2e/design-time-mutation-coordination.spec.ts',
  'tests/e2e/setup-relationship-editors.spec.ts',
  'tests/e2e/assessment-calculated-fields.spec.ts',
  'tests/e2e/mixed-review-set-lifecycle.spec.ts',
  'tests/e2e/assessment-approval-execution.spec.ts',
  'tests/e2e/workflow-r3-approval-authority.spec.ts',
  'tests/e2e/intake-reviews-add-remedy.spec.ts',
  'tests/e2e/intake-reviews-role-projection.spec.ts',
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

const reservedE2eBasenames = [
  notificationEditorE2eSpecPath, extensionProfileE2eSpecPath, ...postgresE2eSpecPaths, ...amendmentRefreshE2eSpecPaths,
  ...agreementCloseoutE2eSpecPaths, ...workflowRecommendationE2eSpecPaths, ...workflowSetupRetiredE2eSpecPaths,
  ...agreementAmendmentsE2eSpecPaths, ...attachmentsE2eSpecPaths, ...agencyStatusesE2eSpecPaths, ...freshResetE2eSpecPaths
].map(path => basename(path).replaceAll('.', String.raw`\.`)).join('|')

export const pgliteE2eFilePattern = String.raw`^(?!(?:.*[/\\])?(?:${reservedE2eBasenames})$)(?!.*\.tmp\.spec\.ts$).*\.spec\.ts$`

export type E2eSuite = 'pglite' | 'postgres' | 'review-scratch' | 'amendment-refresh' | 'agreement-closeout' | 'workflow-recommendation' | 'workflow-setup-retired' | 'agreement-amendments' | 'attachments' | 'agency-statuses' | 'fresh-reset'

export type E2eTestSelection = {
  forwardedPlaywrightArgs: string[]
  suite: E2eSuite
  selectedSpec: string | undefined
}

type ManagedBindHost = '::' | '0.0.0.0'
type ManagedNetwork = { bindHost: ManagedBindHost; ipv6LoopbackAvailable: boolean }

type E2eScriptConfig = {
  forwardedPlaywrightArgs: string[]
  suite: E2eSuite
  selectedSpec: string | undefined
  ownsPgliteDataDir: boolean
  ownsLocalFileStorageDir: boolean
  preferredPort: number
  port: number
  network: ManagedNetwork
  baseUrl: string
  baseUrlFromEnv?: string
  timeoutMs: number
  pgliteDataDir: string
  pgliteAccessDataDir: string
  localFileStorageDir: string
  cleanupDataPaths: () => Promise<void>
  serverMode: 'development' | 'production'
  accessPostgresTestUrl?: string
  postgresTestUrl?: string
}

export type ManagedE2eDataPaths = {
  pgliteDataDir: string
  pgliteAccessDataDir: string
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
 * Stages the demo migration required by an explicit demo production E2E server.
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
  if (serverMode !== 'production' || environmentType !== 'demo') return false
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
 * Probes ephemeral IPv6 binds using the same runtime that hosts Nitro and Nuxt.
 *
 * @returns The wildcard to bind and whether IPv6 loopback is available.
 */
export const probeManagedNetwork = async (): Promise<ManagedNetwork> => {
  const child = Bun.spawn(['node', '--input-type=module', '-e', `
    import { randomUUID } from 'node:crypto'
    import { createConnection, createServer } from 'node:net'
    const acceptsIPv4 = server => new Promise(resolve => {
      const token = randomUUID()
      server.on('connection', socket => socket.end(token))
      const client = createConnection(server.address().port, '127.0.0.1')
      const timer = setTimeout(() => client.destroy(), 1000)
      let receipt = ''
      client.setEncoding('utf8')
      client.on('data', chunk => { receipt += chunk })
      client.once('error', () => {})
      client.once('close', () => {
        clearTimeout(timer)
        resolve(receipt === token)
      })
    })
    const probe = host => new Promise((resolve, reject) => {
      const server = createServer()
      server.once('error', error => {
        if (['EAFNOSUPPORT', 'EADDRNOTAVAIL', 'EPROTONOSUPPORT'].includes(error.code)) resolve(false)
        else reject(error)
      })
      server.listen(0, host, async () => {
        const supported = host === '::' ? await acceptsIPv4(server) : true
        server.close(error => error ? reject(error) : resolve(supported))
      })
    })
    const flags = await Promise.all([probe('::'), probe('::1')])
    process.stdout.write(flags.join(' '))
  `], { stdout: 'pipe', stderr: 'inherit' })
  const [exitCode, result] = await Promise.all([child.exited, new Response(child.stdout).text()])
  const flags = /^(true|false) (true|false)$/.exec(result)
  if (exitCode !== 0 || !flags) throw new Error('Could not probe Node IPv6 bind support for managed E2E.')
  return { bindHost: flags[1] === 'true' ? '::' : '0.0.0.0', ipv6LoopbackAvailable: flags[2] === 'true' }
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

    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })

    server.listen(port, host)
  })
}

/**
 * Finds an available port starting from a preferred port.
 *
 * @param preferredPort - The starting port to check.
 * @param scanLimit - The maximum number of ports to check.
 * @param network - The probed wildcard and loopback capabilities.
 * @returns The first available port found.
 * @throws Error if no port is found within the scan limit.
 */
const findAvailablePort = async (preferredPort: number, scanLimit: number, network: ManagedNetwork): Promise<number> => {
  const hosts = [network.bindHost, '127.0.0.1']
  if (network.ipv6LoopbackAvailable) hosts.push('::1')
  candidate: for (let offset = 0; offset <= scanLimit; offset += 1) {
    const candidatePort = preferredPort + offset
    for (const host of hosts) {
      if (!await canBindHost(candidatePort, host)) continue candidate
    }
    return candidatePort
  }

  throw new Error(`Could not find an available port between ${preferredPort} and ${preferredPort + scanLimit}`)
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
  const isProfileFixtureSpec = selectedSpec === extensionProfileE2eSpecPath
  if (selectedSpec === notificationEditorE2eSpecPath && process.env.GCS_E2E_NOTIFICATION_FIXTURE !== '1') {
    throw new Error('The notification editor fixture requires bun run test:e2e:notification-provider.')
  }
  if (selectedSpec === notificationEditorE2eSpecPath && suite !== 'pglite') {
    throw new Error('The notification editor fixture requires the managed PGlite suite.')
  }
  if (isProfileFixtureSpec && process.env.GCS_E2E_PROFILE_FIXTURE !== '1') {
    throw new Error('The synthetic profile fixture requires bun run test:e2e:extension-profile.')
  }
  const isPostgresSpec = isProfileFixtureSpec || postgresE2eSpecPaths.some(path => path === selectedSpec)
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
    throw new Error('The postgres suite accepts only registered managed PostgreSQL E2E specs.')
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
  let effectiveSelectedSpec = selectedSpec
  if (selectedSuite === 'postgres' && !selectedSpec) {
    throw new Error('The PostgreSQL leaf runner requires one exact --spec; use bun run test:e2e:postgres for all PostgreSQL specs with per-spec reset.')
  }
  if (selectedSuite === 'fresh-reset' && !selectedSpec) {
    throw new Error('The fresh-reset runner requires one exact --spec; use bun run test:e2e:fresh-reset for all fresh-reset specs.')
  }
  if (selectedSpec) {
    assertSpecBelongsToSuite(selectedSuite, selectedSpec)
    forwardedPlaywrightArgs.push(selectedSpec)
  } else if (selectedSuite === 'review-scratch') {
    forwardedPlaywrightArgs.push(reviewScratchE2eFilePattern)
  } else if (selectedSuite === 'amendment-refresh') {
    forwardedPlaywrightArgs.push(...amendmentRefreshE2eSpecPaths)
    effectiveSelectedSpec = amendmentRefreshE2eSpecPaths[0]
  } else if (selectedSuite === 'agreement-closeout') {
    forwardedPlaywrightArgs.push(...agreementCloseoutE2eSpecPaths)
    effectiveSelectedSpec = agreementCloseoutE2eSpecPaths[0]
  } else if (selectedSuite === 'workflow-recommendation') {
    forwardedPlaywrightArgs.push(...workflowRecommendationE2eSpecPaths)
    effectiveSelectedSpec = workflowRecommendationE2eSpecPaths[0]
  } else if (selectedSuite === 'workflow-setup-retired') {
    forwardedPlaywrightArgs.push(...workflowSetupRetiredE2eSpecPaths)
    effectiveSelectedSpec = workflowSetupRetiredE2eSpecPaths[0]
  } else if (selectedSuite === 'agreement-amendments') {
    forwardedPlaywrightArgs.push(...agreementAmendmentsE2eSpecPaths)
    effectiveSelectedSpec = agreementAmendmentsE2eSpecPaths[0]
  } else if (selectedSuite === 'attachments') {
    forwardedPlaywrightArgs.push(...attachmentsE2eSpecPaths)
    effectiveSelectedSpec = attachmentsE2eSpecPaths[0]
  } else if (selectedSuite === 'agency-statuses') {
    forwardedPlaywrightArgs.push(...agencyStatusesE2eSpecPaths)
    effectiveSelectedSpec = agencyStatusesE2eSpecPaths[0]
  } else {
    forwardedPlaywrightArgs.push(pgliteE2eFilePattern)
  }

  return { forwardedPlaywrightArgs, suite: selectedSuite, selectedSpec: effectiveSelectedSpec }
}

/**
 * Validates the dedicated disposable database URL for managed PostgreSQL E2E.
 *
 * @param environment - Environment containing E2E_POSTGRES_TEST_URL.
 * @param variableName - Explicit disposable database input to validate.
 * @returns The validated PostgreSQL URL.
 */
export const requireDisposableE2ePostgresUrl = (environment: NodeJS.ProcessEnv, variableName = E2E_POSTGRES_TEST_URL_ENV): string => {
  const value = environment[variableName]?.trim()
  if (!value) {
    throw new Error(`${variableName} is required for the PostgreSQL E2E suite.`)
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL URL.`)
  }

  const databaseName = decodeURIComponent(url.pathname).split('/').filter(Boolean).at(-1) ?? ''
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !databaseName.endsWith('_test')) {
    throw new Error(`${variableName} must be a PostgreSQL URL whose database name ends in _test.`)
  }

  return value
}

const POSTGRES_E2E_LOCK_QUERY = 'SELECT pg_try_advisory_lock(hashtext(\'gcs-ssc-managed-e2e\')) AS acquired'
const POSTGRES_E2E_UNLOCK_QUERY = 'SELECT pg_advisory_unlock(hashtext(\'gcs-ssc-managed-e2e\'))'

const resetPostgresE2eSchemas = async (client: PostgresSchemaClient): Promise<void> => {
  await client.query('DROP SCHEMA IF EXISTS extensions CASCADE')
  await client.query('DROP SCHEMA IF EXISTS audit CASCADE')
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
  const providedPgliteAccessDataDir = environment.PGLITE_ACCESS_DATA_DIR
  let ownedPgliteAccessDataDir: string | undefined
  const providedLocalFileStorageDir = environment.GCS_LOCAL_FILE_STORAGE_DIR
  let ownedPgliteDataDir: string | undefined
  let ownedLocalFileStorageDir: string | undefined

  try {
    if (!providedPgliteAccessDataDir) {
      ownedPgliteAccessDataDir = await mkdtemp(join(temporaryRoot, 'gcs-ssc-access-pglite-e2e-'))
    }
    if (!providedPgliteDataDir) {
      ownedPgliteDataDir = await mkdtemp(join(temporaryRoot, DEFAULT_PGLITE_DATA_DIR_PREFIX))
    }
    if (!providedLocalFileStorageDir) {
      ownedLocalFileStorageDir = await mkdtemp(join(temporaryRoot, DEFAULT_LOCAL_FILE_STORAGE_DIR_PREFIX))
    }
  } catch (error) {
    await Promise.all([
      ownedPgliteAccessDataDir ? rm(ownedPgliteAccessDataDir, { recursive: true, force: true }) : Promise.resolve(),
      ownedPgliteDataDir ? rm(ownedPgliteDataDir, { recursive: true, force: true }) : Promise.resolve(),
      ownedLocalFileStorageDir
        ? rm(ownedLocalFileStorageDir, { recursive: true, force: true })
        : Promise.resolve()
    ])
    throw error
  }

  const pgliteDataDir = providedPgliteDataDir || ownedPgliteDataDir
  const pgliteAccessDataDir = providedPgliteAccessDataDir || ownedPgliteAccessDataDir
  const localFileStorageDir = providedLocalFileStorageDir || ownedLocalFileStorageDir
  if (!pgliteDataDir || !pgliteAccessDataDir || !localFileStorageDir) {
    throw new Error('Managed E2E data paths could not be resolved.')
  }

  let cleanedUp = false
  return {
    pgliteDataDir,
    pgliteAccessDataDir,
    localFileStorageDir,
    ownsPgliteDataDir: ownedPgliteDataDir !== undefined,
    ownsLocalFileStorageDir: ownedLocalFileStorageDir !== undefined,
    cleanup: async () => {
      if (cleanedUp) return
      cleanedUp = true
      await Promise.all([
        ownedPgliteAccessDataDir ? rm(ownedPgliteAccessDataDir, { recursive: true, force: true }) : Promise.resolve(),
        ownedPgliteDataDir ? rm(ownedPgliteDataDir, { recursive: true, force: true }) : Promise.resolve(),
        ownedLocalFileStorageDir
          ? rm(ownedLocalFileStorageDir, { recursive: true, force: true })
          : Promise.resolve()
      ])
    }
  }
}

export const resolveE2ePort = async (
  baseUrlFromEnv: string | undefined,
  preferredPort: number,
  network: ManagedNetwork
): Promise<number> => {
  if (baseUrlFromEnv) {
    const url = parseManagedClientUrl(baseUrlFromEnv)
    return Number(url.port || (url.protocol === 'https:' ? 443 : 80))
  }

  return await findAvailablePort(preferredPort, DEFAULT_PORT_SCAN_LIMIT, network)
}

export const resolveBaseUrl = (
  baseUrlFromEnv: string | undefined,
  port: number,
  serverMode: E2eScriptConfig['serverMode']
): string => baseUrlFromEnv || `http://${serverMode === 'development' ? '127.0.0.1' : 'localhost'}:${port}`

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

const resolveE2eScriptConfig = async (): Promise<E2eScriptConfig> => {
  const selection = resolveE2eTestSelection(process.argv.slice(2), process.env.E2E_SPEC?.trim())
  const preferredPort = getNumberProcessEnvValue('E2E_PORT', DEFAULT_PORT)
  const baseUrlFromEnv = process.env.PLAYWRIGHT_BASE_URL
  const network = await probeManagedNetwork()
  const port = await resolveE2ePort(baseUrlFromEnv, preferredPort, network)
  const timeoutMs = getNumberProcessEnvValue('E2E_SERVER_WAIT_MS', DEFAULT_WAIT_TIMEOUT_MS)
  const serverMode = resolveManagedE2eServerMode(selection.suite, process.env.E2E_SERVER_MODE)
  const baseUrl = resolveBaseUrl(baseUrlFromEnv, port, serverMode)
  const postgresTestUrl = selection.suite === 'postgres'
    ? requireDisposableE2ePostgresUrl(process.env)
    : undefined
  const accessPostgresTestUrl = selection.suite === 'postgres'
    ? requireDisposableE2ePostgresUrl(process.env, E2E_ACCESS_POSTGRES_TEST_URL_ENV)
    : undefined
  if (postgresTestUrl && accessPostgresTestUrl) {
    const business = new URL(postgresTestUrl)
    const access = new URL(accessPostgresTestUrl)
    if (business.host === access.host) throw new Error('E2E_ACCESS_POSTGRES_TEST_URL must use a separate PostgreSQL instance.')
  }
  const dataPaths = await createManagedE2eDataPaths()

  return {
    forwardedPlaywrightArgs: selection.forwardedPlaywrightArgs,
    suite: selection.suite,
    selectedSpec: selection.selectedSpec,
    ownsPgliteDataDir: dataPaths.ownsPgliteDataDir,
    ownsLocalFileStorageDir: dataPaths.ownsLocalFileStorageDir,
    preferredPort,
    port,
    network,
    baseUrl,
    baseUrlFromEnv,
    timeoutMs,
    pgliteDataDir: dataPaths.pgliteDataDir,
    pgliteAccessDataDir: dataPaths.pgliteAccessDataDir,
    localFileStorageDir: dataPaths.localFileStorageDir,
    cleanupDataPaths: dataPaths.cleanup,
    serverMode,
    ...(postgresTestUrl ? { postgresTestUrl, accessPostgresTestUrl } : {})
  }
}

export const buildE2eEnv = (
  baseUrl: string,
  pgliteDataDir: string,
  localFileStorageDir: string,
  suite: E2eSuite,
  postgresConnectionString?: string,
  accessPostgresConnectionString?: string,
  pgliteAccessDataDir = join(pgliteDataDir, 'access-history')
): NodeJS.ProcessEnv => {
  const env = {
    ...process.env,
    PGLITE_DATA_DIR: pgliteDataDir,
    PGLITE_ACCESS_DATA_DIR: pgliteAccessDataDir,
    GCS_LOCAL_FILE_STORAGE_DIR: localFileStorageDir,
    BETTER_AUTH_SECRET: getProcessEnvValue('BETTER_AUTH_SECRET', DEFAULT_AUTH_SECRET),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL?.trim() || baseUrl,
    BETTER_AUTH_TRUSTED_ORIGINS: getProcessEnvValue('BETTER_AUTH_TRUSTED_ORIGINS', baseUrl),
    BETTER_AUTH_DISABLE_LOGGER: getProcessEnvValue('BETTER_AUTH_DISABLE_LOGGER', 'true'),
    NUXT_DISABLE_SOURCEMAPS: getProcessEnvValue('NUXT_DISABLE_SOURCEMAPS', 'true'),
    ENVIRONMENT_TYPE: getProcessEnvValue('ENVIRONMENT_TYPE', 'demo'),
    PLAYWRIGHT_WORKERS: getProcessEnvValue('PLAYWRIGHT_WORKERS', DEFAULT_PLAYWRIGHT_WORKERS)
  }
  Object.assign(env, { GCS_E2E_SUITE: suite, GCS_E2E_SERVER_MODE: resolveManagedE2eServerMode(suite, process.env.E2E_SERVER_MODE) })
  if (suite === 'agreement-amendments') Object.assign(env, { E2E_ISOLATED_AMENDMENT_AGREEMENT: '1' })
  delete env.GCS_E2E_FIXTURE_ISOLATION
  delete env.DATABASE_URL
  delete env.GCS_ACCESS_DATABASE_URL
  delete env.NUXT_ACCESS_DATABASE_URL
  delete env.NUXT_PGLITE_ACCESS_DATA_DIR
  delete env.E2E_ACCESS_POSTGRES_TEST_URL
  delete env.NUXT_DATABASE_URL
  delete env.E2E_POSTGRES_TEST_URL
  delete env.PGOPTIONS
  delete env.NO_COLOR

  if (suite === 'postgres') {
    if (!postgresConnectionString) throw new Error('PostgreSQL E2E isolation was not prepared.')
    if (!accessPostgresConnectionString) throw new Error('PostgreSQL access E2E isolation was not prepared.')
    env.DATABASE_URL = postgresConnectionString
    env.GCS_ACCESS_DATABASE_URL = accessPostgresConnectionString
  }
  if (suite === 'review-scratch') {
    env.E2E_REVIEW_SCRATCH = '1'
  } else {
    delete env.E2E_REVIEW_SCRATCH
  }

  return env
}

export const resolveFixtureIsolationCapability = (options: {
  spec: string | undefined
  database: 'pglite' | 'postgres'
  databaseOwned: boolean
  storageOwned: boolean
  serverOwned: boolean
}): string | undefined => {
  if (!options.spec || !options.databaseOwned || !options.storageOwned || !options.serverOwned) return undefined
  assertCanonicalExistingSpecPath(options.spec)
  return JSON.stringify({ spec: options.spec, database: options.database, databaseOwned: true, storageOwned: true })
}

export const createManagedFixtureSecretsKey = (spec: string | undefined, ownsFixture: boolean): string | undefined =>
  ownsFixture && spec === hostileDeepLinksE2eSpecPath ? randomBytes(32).toString('base64') : undefined

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
 * @param bindHost - Loopback address selected for the development child.
 * @returns Direct child command for the runner.
 */
export const buildManagedServerCommand = (
  port: number,
  serverMode: E2eScriptConfig['serverMode'],
  bindHost: string
): string[] => serverMode === 'production'
  ? ['node', '.output/server/index.mjs']
  : ['bun', 'run', 'scripts/dev.ts', '--no-fork', '--port', String(port), '--host', bindHost]

export const spawnManagedServer = (
  port: number,
  env: NodeJS.ProcessEnv,
  serverMode: E2eScriptConfig['serverMode'],
  network: ManagedNetwork,
  baseUrl = resolveBaseUrl(undefined, port, serverMode)
): { process: Bun.Subprocess; listening: ManagedServerListening } => {
  const clientHost = parseManagedClientUrl(baseUrl).hostname
  const devHost = clientHost === '[::1]' ? '::1' : /^127\./.test(clientHost) ? clientHost : '127.0.0.1'
  const bindHost = serverMode === 'production' ? env.NITRO_HOST || env.HOST || network.bindHost : devHost
  const child = Bun.spawn(buildManagedServerCommand(port, serverMode, bindHost), {
    cwd: process.cwd(),
    env: { ...env, PORT: String(port), NITRO_HOST: bindHost },
    stdio: ['inherit', 'pipe', 'inherit']
  })
  const receipt = observeManagedServerOutput(child.stdout, serverMode).then(address => {
    // Nuxt can display localhost for a numeric loopback bind.
    if (serverMode === 'development' && address.hostname === 'localhost') {
      address.hostname = bindHost === '::1' ? '[::1]' : bindHost
    }
    return address
  })
  return {
    process: child,
    listening: {
      receipt,
      ...(bindHost === '::' && network.bindHost === '::' ? { ipv6Wildcard: 'dual-stack' } : {}),
      ...(!network.ipv6LoopbackAvailable ? { ipv6LoopbackUnavailable: true } : {})
    }
  }
}

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
  serverEnv: NodeJS.ProcessEnv,
  additionalCleanup?: () => Promise<void>
): Promise<void> => {
  const { process: devProcess, listening } = spawnManagedServer(config.port, serverEnv, config.serverMode, config.network, config.baseUrl)
  let e2eProcess: Bun.Subprocess | undefined
  const cleanup = createProcessCleanup(devProcess, () => e2eProcess, additionalCleanup)
  const { handleSigint, handleSigterm } = registerCleanupSignals(cleanup)

  try {
    await waitForManagedServerReady(`${config.baseUrl}/api/health`, config.timeoutMs, devProcess, listening)
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
  resolveE2eTestSelection(rawArgs, process.env.E2E_SPEC?.trim())
  if (process.env[NUXT_ARTIFACT_LOCK_ENV] !== '1') {
    if (process.env.PLAYWRIGHT_BASE_URL) parseManagedClientUrl(process.env.PLAYWRIGHT_BASE_URL)
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
  let accessPostgresIsolation: PostgresE2eIsolation | undefined
  const cleanupManagedResources = async (): Promise<void> => {
    const results = await Promise.allSettled([
      postgresIsolation?.cleanup(),
      accessPostgresIsolation?.cleanup(),
      config.cleanupDataPaths()
    ])
    const failure = results.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
  }

  try {
    if (config.postgresTestUrl) {
      if (!config.accessPostgresTestUrl) throw new Error('E2E_ACCESS_POSTGRES_TEST_URL is required for the PostgreSQL E2E suite.')
      accessPostgresIsolation = await createPostgresE2eIsolation(config.accessPostgresTestUrl)
      postgresIsolation = await createPostgresE2eIsolation(config.postgresTestUrl)
      console.info(`[e2e] Reset and exclusively locked disposable PostgreSQL database ${postgresIsolation.databaseName}.`)
    }

    const env = buildE2eEnv(
      config.baseUrl,
      config.pgliteDataDir,
      config.localFileStorageDir,
      config.suite,
      postgresIsolation?.connectionString,
      accessPostgresIsolation?.connectionString,
      config.pgliteAccessDataDir
    )
    const fixtureIsolation = resolveFixtureIsolationCapability({
      spec: config.selectedSpec,
      database: postgresIsolation ? 'postgres' : 'pglite',
      databaseOwned: postgresIsolation !== undefined || config.ownsPgliteDataDir,
      storageOwned: config.ownsLocalFileStorageDir,
      serverOwned: !config.baseUrlFromEnv
    })
    if (fixtureIsolation) env.GCS_E2E_FIXTURE_ISOLATION = fixtureIsolation
    const fixtureSecretsKey = createManagedFixtureSecretsKey(config.selectedSpec, fixtureIsolation !== undefined)
    if (fixtureSecretsKey) delete env.GCS_EXTENSION_SECRETS_KEY
    await prepareManagedProductionServer(
      config.serverMode,
      env.ENVIRONMENT_TYPE,
      command => runInheritedCommandWithEnv(command, env)
    )
    const serverEnv = fixtureSecretsKey ? { ...env, GCS_EXTENSION_SECRETS_KEY: fixtureSecretsKey } : env
    await runE2eTests(config, env, serverEnv, cleanupManagedResources)
  } finally {
    await cleanupManagedResources()
  }
}

if (import.meta.main) await main()
