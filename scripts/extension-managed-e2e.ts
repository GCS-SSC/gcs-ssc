import { mkdir, mkdtemp, realpath, rm, stat } from 'node:fs/promises'
import { spawn as spawnChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export type ManagedExtensionE2eConfig = {
  acceptedSpec: string
  extensionKey: string
  extensionRoot: string
  suite: string
}

export type ManagedChild = {
  readonly exitCode: number | null
  readonly exited: Promise<number>
  readonly signalCode: NodeJS.Signals | null
  kill: (signal?: NodeJS.Signals) => boolean
}

type SpawnManagedChild = (
  command: string[],
  options: { cwd: string, env: NodeJS.ProcessEnv, stdio: ['inherit', 'inherit', 'inherit'] }
) => ManagedChild

type ManagedSignalSource = {
  off: (event: 'SIGINT' | 'SIGTERM', listener: () => void) => unknown
  once: (event: 'SIGINT' | 'SIGTERM', listener: () => void) => unknown
}

export type ManagedExtensionE2eDependencies = {
  allocatePort: () => Promise<number>
  createDataPaths: () => Promise<ManagedExtensionDataPaths>
  exit: (code: number) => void
  prepareHost: (environment: NodeJS.ProcessEnv) => Promise<void>
  signalSource: ManagedSignalSource
  spawn: SpawnManagedChild
  waitForHost: (url: string, server: ManagedChild) => Promise<void>
}

export type ManagedExtensionDataPaths = {
  localFileStorageDir: string
  pgliteDataDir: string
  cleanup: () => Promise<void>
}

const repositoryRoot = resolve(import.meta.dirname, '..')

/**
 * Allocates a disposable loopback port.
 *
 * @returns An available loopback port.
 */
const allocatePort = async (): Promise<number> => await new Promise((resolvePort, reject) => {
  const server = createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (!address || typeof address === 'string') {
      server.close()
      reject(new Error('Could not allocate a disposable extension E2E port.'))
      return
    }
    server.close(error => error ? reject(error) : resolvePort(address.port))
  })
})

/**
 * Starts a child process and exposes its completion state.
 *
 * @param command - The executable and arguments.
 * @param options - The child process execution options.
 * @returns The managed child handle.
 */
const spawnManagedChild: SpawnManagedChild = (command, options) => {
  const child = spawnChildProcess(command[0]!, command.slice(1), options)
  const exited = new Promise<number>((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', code => resolveExit(code ?? 1))
  })
  return {
    /**
     * Returns the child exit code once available.
     *
     * @returns The exit code or null while running.
     */
    get exitCode() { return child.exitCode },
    exited,
    /**
     * Returns the signal that terminated the child, if any.
     *
     * @returns The terminating signal or null.
     */
    get signalCode() { return child.signalCode },
    kill: signal => child.kill(signal)
  }
}

/**
 * Runs a command from the repository root.
 *
 * @param command - The executable and arguments.
 * @param environment - The child process environment.
 * @returns The command exit code.
 */
const runRootCommand = async (command: string[], environment: NodeJS.ProcessEnv): Promise<number> => {
  return await spawnManagedChild(command, {
    cwd: repositoryRoot,
    env: environment,
    stdio: ['inherit', 'inherit', 'inherit']
  }).exited
}

/**
 * Creates isolated data paths for a managed extension run.
 *
 * @returns The temporary data paths and cleanup callback.
 */
const createDataPaths = async (): Promise<ManagedExtensionDataPaths> => {
  const root = await mkdtemp(join(tmpdir(), 'gcs-extension-e2e-'))
  const pgliteDataDir = join(root, 'pglite')
  const localFileStorageDir = join(root, 'files')
  await Promise.all([
    mkdir(pgliteDataDir, { mode: 0o700, recursive: true }),
    mkdir(localFileStorageDir, { mode: 0o700, recursive: true })
  ])
  return {
    localFileStorageDir,
    pgliteDataDir,
    cleanup: async () => await rm(root, { force: true, recursive: true })
  }
}

/**
 * Builds the host and stages its demo migration.
 *
 * @param environment - The managed host environment.
 */
const prepareHost = async (environment: NodeJS.ProcessEnv): Promise<void> => {
  const buildExitCode = await runRootCommand(['bun', 'run', 'build'], environment)
  if (buildExitCode !== 0) throw new Error(`Could not build the managed extension host (exit ${buildExitCode}).`)
  const migrationOutput = '.output/server/demo-migrations/demo.mjs'
  await mkdir(dirname(resolve(repositoryRoot, migrationOutput)), { recursive: true })
  const migrationExitCode = await runRootCommand(
    ['bun', 'run', 'scripts/build-demo-migration.ts', migrationOutput],
    environment
  )
  if (migrationExitCode !== 0) {
    throw new Error(`Could not stage the managed extension demo migration (exit ${migrationExitCode}).`)
  }
}

/**
 * Waits until the managed host reports healthy.
 *
 * @param url - The managed host base URL.
 * @param server - The managed server process.
 */
const waitForHost = async (url: string, server: ManagedChild): Promise<void> => {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Managed extension host exited with code ${server.exitCode}.`)
    try {
      const response = await fetch(`${url}/api/health`)
      if (response.ok) return
    } catch {
      // The managed server is still starting.
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 250))
  }
  throw new Error('Timed out waiting for the managed extension host.')
}

/**
 * Returns production dependencies for the managed runner.
 *
 * @returns The default runner dependencies.
 */
const defaultDependencies = (): ManagedExtensionE2eDependencies => ({
  allocatePort,
  createDataPaths,
  exit: code => process.exit(code),
  prepareHost,
  signalSource: process,
  spawn: spawnManagedChild,
  waitForHost
})

/**
 * Validates and canonicalizes the single extension-owned spec argument.
 *
 * @param config - The extension runner configuration.
 * @param rawArguments - The command-line spec arguments.
 * @returns The validated extension-relative spec path.
 */
const validateManagedExtensionSpec = async (
  config: ManagedExtensionE2eConfig,
  rawArguments: string[]
): Promise<string> => {
  const argumentsWithoutSeparator = rawArguments.filter(argument => argument !== '--')
  if (argumentsWithoutSeparator.length !== 1 || argumentsWithoutSeparator[0] !== config.acceptedSpec) {
    throw new Error(`${config.extensionKey} managed E2E accepts only the exact owned spec: ${config.acceptedSpec}`)
  }
  const specPath = resolve(config.extensionRoot, argumentsWithoutSeparator[0])
  const canonicalExtensionRoot = await realpath(config.extensionRoot)
  const canonicalSpecPath = await realpath(specPath)
  if (!canonicalSpecPath.startsWith(`${canonicalExtensionRoot}/`) || !(await stat(canonicalSpecPath)).isFile()) {
    throw new Error(`${config.extensionKey} E2E spec is not a canonical extension-owned file: ${argumentsWithoutSeparator[0]}`)
  }
  return argumentsWithoutSeparator[0]
}

/**
 * Runs one extension-owned Playwright spec against an isolated managed host.
 *
 * @param config - The extension runner configuration.
 * @param rawArguments - The command-line spec arguments.
 * @param inheritedEnvironment - Environment variables inherited by child processes.
 * @param dependencies - Injectable runner dependencies.
 */
export const runManagedExtensionE2e = async (
  config: ManagedExtensionE2eConfig,
  rawArguments: string[],
  inheritedEnvironment: NodeJS.ProcessEnv = process.env,
  dependencies: ManagedExtensionE2eDependencies = defaultDependencies()
): Promise<void> => {
  const selectedSpec = await validateManagedExtensionSpec(config, rawArguments)
  const dataPaths = await dependencies.createDataPaths()
  let server: ManagedChild | undefined
  let playwright: ManagedChild | undefined
  let cleanedUp = false
  /** Stops child processes and removes isolated data. */
  const cleanup = async (): Promise<void> => {
    if (cleanedUp) return
    cleanedUp = true
    playwright?.kill()
    server?.kill()
    await Promise.allSettled([
      playwright?.exited,
      server?.exited,
      dataPaths.cleanup()
    ].filter((value): value is Promise<number> | Promise<void> => value !== undefined))
  }
  /**
   * Cleans up before exiting for a process signal.
   *
   * @param code - The process exit code.
   */
  const exitForSignal = (code: number): void => {
    void cleanup().finally(() => dependencies.exit(code))
  }
  /**
   * Handles an interrupt signal.
   *
   * @returns Nothing.
   */
  const handleSigint = (): void => exitForSignal(130)
  /**
   * Handles a termination signal.
   *
   * @returns Nothing.
   */
  const handleSigterm = (): void => exitForSignal(143)

  try {
    const port = await dependencies.allocatePort()
    const baseUrl = `http://127.0.0.1:${port}`
    const environment: NodeJS.ProcessEnv = {
      ...inheritedEnvironment,
      BETTER_AUTH_DISABLE_LOGGER: 'true',
      BETTER_AUTH_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      BETTER_AUTH_TRUSTED_ORIGINS: baseUrl,
      BETTER_AUTH_URL: baseUrl,
      ENVIRONMENT_TYPE: 'development',
      GCS_E2E_EXTENSION_WORKSPACE: config.extensionKey,
      GCS_E2E_SERVER_MODE: 'production',
      GCS_E2E_SUITE: config.suite,
      GCS_LOCAL_FILE_STORAGE_DIR: dataPaths.localFileStorageDir,
      NUXT_DISABLE_SOURCEMAPS: 'true',
      PGLITE_DATA_DIR: dataPaths.pgliteDataDir,
      PLAYWRIGHT_BASE_URL: baseUrl,
      PLAYWRIGHT_WORKERS: '1'
    }
    delete environment.DATABASE_URL
    delete environment.E2E_POSTGRES_TEST_URL
    delete environment.NUXT_DATABASE_URL
    delete environment.PGOPTIONS

    await dependencies.prepareHost(environment)
    server = dependencies.spawn(['node', '.output/server/index.mjs'], {
      cwd: repositoryRoot,
      env: { ...environment, PORT: String(port) },
      stdio: ['inherit', 'inherit', 'inherit']
    })
    dependencies.signalSource.once('SIGINT', handleSigint)
    dependencies.signalSource.once('SIGTERM', handleSigterm)
    await dependencies.waitForHost(baseUrl, server)
    playwright = dependencies.spawn([
      'bun', 'x', 'playwright', 'test', '--config', 'playwright.config.ts', selectedSpec
    ], {
      cwd: config.extensionRoot,
      env: environment,
      stdio: ['inherit', 'inherit', 'inherit']
    })
    const outcome = await Promise.race([
      playwright.exited.then(exitCode => ({ exitCode, owner: 'playwright' as const })),
      server.exited.then(exitCode => ({ exitCode, owner: 'server' as const }))
    ])
    if (outcome.owner === 'server') {
      throw new Error(`Managed ${config.extensionKey} host exited during Playwright with code ${outcome.exitCode}.`)
    }
    if (outcome.exitCode !== 0) {
      throw new Error(`${config.extensionKey} Playwright exited with code ${outcome.exitCode}.`)
    }
  } finally {
    dependencies.signalSource.off('SIGINT', handleSigint)
    dependencies.signalSource.off('SIGTERM', handleSigterm)
    await cleanup()
  }
}
