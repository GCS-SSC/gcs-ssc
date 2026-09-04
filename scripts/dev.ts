import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

type DevChildProcess = {
  exited: Promise<number>
  kill: (signal?: NodeJS.Signals | number) => void
}

type DevSignalSource = Pick<NodeJS.Process, 'off' | 'once'>

/**
 * Resolves the dev server port from forwarded CLI args.
 *
 * @param args - Raw CLI args passed to the dev script.
 * @returns The requested port or the default Nuxt port.
 */
export const resolveDevPort = (args: string[]): number => {
  /**
   * Parses and validates a forwarded port value.
   *
   * @param value - Raw CLI value.
   * @returns A valid TCP/UDP port, or the default Nuxt port.
   */
  const parsePort = (value: string | undefined): number => {
    const portValue = Number(value)

    if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) {
      console.warn(`[dev] parsePort received invalid port "${String(value)}"; falling back to 3000`)
      return 3000
    }

    return portValue
  }

  const equalsSyntaxArg = args.find(arg => arg.startsWith('--port=') || arg.startsWith('-p='))
  if (equalsSyntaxArg) {
    return parsePort(equalsSyntaxArg.slice(equalsSyntaxArg.indexOf('=') + 1))
  }

  const portFlagIndex = args.findIndex(arg => arg === '--port' || arg === '-p')

  if (portFlagIndex === -1) {
    return 3000
  }

  const rawPort = args[portFlagIndex + 1]
  if (typeof rawPort !== 'string' || rawPort.trim().length === 0) {
    console.warn('[dev] missing port value after --port/-p; falling back to 3000')
    return 3000
  }

  return parsePort(rawPort)
}

/**
 * Resolves the dev server host from forwarded CLI args.
 *
 * @param args - Raw CLI args passed to the dev script.
 * @returns The requested host or the default local host.
 */
export const resolveDevHost = (args: string[]): string => {
  const equalsSyntaxArg = args.find(arg => arg.startsWith('--host=') || arg.startsWith('-H='))
  if (equalsSyntaxArg) {
    return equalsSyntaxArg.slice(equalsSyntaxArg.indexOf('=') + 1).trim() || 'localhost'
  }

  const hostFlagIndex = args.findIndex(arg => arg === '--host' || arg === '-H')

  if (hostFlagIndex === -1) {
    return 'localhost'
  }

  const rawHost = args[hostFlagIndex + 1]
  if (typeof rawHost !== 'string' || rawHost.trim().length === 0) {
    console.warn('[dev] missing host value after --host/-H; falling back to localhost')
    return 'localhost'
  }

  return rawHost.trim()
}

/**
 * Resolves the auth protocol from a host-like input.
 *
 * @param host - Host or URL-like CLI host value.
 * @returns The protocol Better Auth should use.
 */
export const resolveProtocol = (host: string): string => {
  if (host.startsWith('https://')) {
    return 'https'
  }

  return 'http'
}

/**
 * Disables Nitro's leaking WASM source-map consumer by default in development.
 * Set NUXT_DISABLE_SOURCEMAPS=false explicitly when mapped server stacks are needed.
 *
 * @param value - Explicit source-map override from the process environment.
 * @returns The explicit value or the safe development default.
 */
export const resolveDevSourceMapSetting = (value: string | undefined): string => value ?? 'true'

/**
 * Strips protocol prefixes from a host-like input.
 *
 * @param host - Host or URL-like CLI host value.
 * @returns A bare host name suitable for URL construction.
 */
export const normalizeHost = (host: string): string => {
  const normalizedHost = host.replace(/^https?:\/\//, '').trim()
  if (!normalizedHost) {
    return 'localhost'
  }

  if (normalizedHost.startsWith('[')) {
    const closingBracketIndex = normalizedHost.indexOf(']')
    return closingBracketIndex === -1 ? normalizedHost : normalizedHost.slice(1, closingBracketIndex)
  }

  const colonIndex = normalizedHost.indexOf(':')
  const hasSingleColon = colonIndex !== -1 && colonIndex === normalizedHost.lastIndexOf(':')
  return hasSingleColon ? normalizedHost.slice(0, colonIndex) : normalizedHost
}

/**
 * Formats a bare host for use inside an origin URL.
 *
 * @param host - Bare host name or IP address.
 * @returns Host formatted for URL origin construction.
 */
const formatOriginHost = (host: string): string => {
  if (host.includes(':') && !host.startsWith('[')) {
    return `[${host}]`
  }

  return host
}

/**
 * Bundles the explicit source worker outside Nuxt's generated development tree.
 *
 * @param repositoryRoot - Repository root containing the worker source.
 * @returns Absolute path to the executable development worker.
 */
export const buildDevAdminSqlDumpWorker = async (repositoryRoot: string): Promise<string> => {
  const workerOutputDir = path.resolve(repositoryRoot, '.data/dev-workers')
  await mkdir(workerOutputDir, { recursive: true })
  const result = await Bun.build({
    entrypoints: [path.resolve(repositoryRoot, 'server/workers/admin-sql-dump.ts')],
    external: ['@electric-sql/*', 'kysely'],
    format: 'esm',
    naming: 'admin-sql-dump-worker.mjs',
    outdir: workerOutputDir,
    target: 'bun'
  })
  if (!result.success) {
    throw new AggregateError(result.logs, 'Failed to build the development admin SQL dump worker')
  }
  return path.resolve(workerOutputDir, 'admin-sql-dump-worker.mjs')
}

/**
 * Builds the dev-mode Better Auth origin list from the active host and port.
 *
 * @param host - Resolved dev host.
 * @param port - Resolved dev port.
 * @returns The list of origins Better Auth should trust in dev.
 */
export const buildDevAuthOrigins = (host: string, port: number): string[] => {
  const protocol = resolveProtocol(host)
  const normalizedHost = normalizeHost(host)
  const candidateHosts = new Set<string>([
    normalizedHost
  ])

  if (normalizedHost === '0.0.0.0' || normalizedHost === '::') {
    candidateHosts.add('localhost')
    candidateHosts.add('127.0.0.1')
  }

  return Array.from(candidateHosts, candidateHost => `${protocol}://${formatOriginHost(candidateHost)}:${port}`)
}

/**
 * Owns the Nuxt child until exit and forwards terminal signals exactly once.
 *
 * @param child - Spawned Nuxt development process.
 * @param signalSource - Process-like signal source, overridable for tests.
 * @returns The Nuxt child exit code.
 */
export const waitForDevChildExit = async (
  child: DevChildProcess,
  signalSource: DevSignalSource = process
): Promise<number> => {
  let forwardedSignal: NodeJS.Signals | undefined

  /**
   * Forwards only the first terminal signal received while the child is active.
   *
   * @param signal - Terminal signal received by the wrapper.
   */
  const forwardSignal = (signal: NodeJS.Signals): void => {
    if (forwardedSignal) return
    forwardedSignal = signal
    child.kill(signal)
  }
  const handleSigint = (): void => forwardSignal('SIGINT')
  const handleSigterm = (): void => forwardSignal('SIGTERM')

  signalSource.once('SIGINT', handleSigint)
  signalSource.once('SIGTERM', handleSigterm)

  try {
    return await child.exited
  } finally {
    signalSource.off('SIGINT', handleSigint)
    signalSource.off('SIGTERM', handleSigterm)
  }
}

/**
 * Main entry point for the dev script.
 */
const main = async (): Promise<void> => {
  const args = process.argv.slice(2)
  const shouldClean = args.includes('--clean')
  const forwardedArgs = args.filter(arg => arg !== '--clean')
  const defaultPglitePath = path.resolve(process.cwd(), '.data/pglite')

  if (shouldClean) {
    await rm(defaultPglitePath, { recursive: true, force: true })
    console.info(`[dev] cleaned ${defaultPglitePath}`)
  }

  const port = resolveDevPort(forwardedArgs)
  const host = resolveDevHost(forwardedArgs)
  const devAuthOrigins = buildDevAuthOrigins(host, port)
  const authUrl = devAuthOrigins[0] ?? `http://localhost:${port}`
  const devAdminSqlDumpWorkerPath = await buildDevAdminSqlDumpWorker(process.cwd())
  const proc = Bun.spawn(['bun', 'x', 'nuxt', 'dev', ...forwardedArgs], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NUXT_DISABLE_SOURCEMAPS: resolveDevSourceMapSetting(process.env.NUXT_DISABLE_SOURCEMAPS),
      BETTER_AUTH_URL: authUrl,
      BETTER_AUTH_BASE_URL: authUrl,
      GCS_DEV_ADMIN_SQL_DUMP_WORKER_PATH: devAdminSqlDumpWorkerPath,
      BETTER_AUTH_TRUSTED_ORIGINS: Array.from(new Set([
        ...devAuthOrigins,
        ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',').map(origin => origin.trim()).filter(Boolean) ?? []),
        ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
        ...(process.env.BETTER_AUTH_BASE_URL ? [process.env.BETTER_AUTH_BASE_URL] : [])
      ])).join(',')
    },
    stdio: ['inherit', 'inherit', 'inherit']
  })

  process.exitCode = await waitForDevChildExit(proc)
}

if (import.meta.main) {
  await main()
}
