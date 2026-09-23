const SHARD_COUNT = 8
const managedCommand = ['bun', 'run', 'scripts/test-e2e.ts', '--suite', 'pglite'] as const

type E2eCommandRunner = (command: string[]) => Promise<number>

/**
 * Preserves focused selections while bounding a full PGlite run to fresh managed shards.
 * @param args - Playwright arguments forwarded by the package command.
 * @param environment - Environment used to detect an explicit focused spec.
 * @returns One focused command or eight complete Playwright shard commands.
 */
export const buildPgliteE2eCommands = (
  args: string[],
  environment: NodeJS.ProcessEnv = process.env
): string[][] => {
  const focused = Boolean(environment.E2E_SPEC)
    || args.some(arg => arg === '--spec' || arg.startsWith('--spec=') || arg === '--shard' || arg.startsWith('--shard='))
  if (focused) return [[...managedCommand, ...args]]
  return Array.from({ length: SHARD_COUNT }, (_, index) => [
    ...managedCommand, ...args, '--shard', `${index + 1}/${SHARD_COUNT}`
  ])
}

/**
 * Runs every shard serially and fails the aggregate if any managed invocation fails.
 * @param commands - Managed commands to execute in order.
 * @param run - Injectable command runner for focused verification.
 * @param report - Progress reporter.
 * @returns Zero only when every shard passed, or a signal or failed shard exit code.
 */
export const runPgliteE2eCommands = async (
  commands: string[][],
  run?: E2eCommandRunner,
  report: (message: string) => void = console.info
): Promise<number> => {
  if (commands.length === 0) throw new Error('The PGlite E2E runner requires at least one command.')
  let activeProcess: Bun.Subprocess | undefined
  let interrupted: 'SIGINT' | 'SIGTERM' | undefined
  const onSignal = (signal: 'SIGINT' | 'SIGTERM') => {
    interrupted ??= signal
    activeProcess?.kill(signal)
  }
  const onSigint = () => onSignal('SIGINT')
  const onSigterm = () => onSignal('SIGTERM')
  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)

  const execute = run ?? (async (command: string[]) => {
    activeProcess = Bun.spawn(command, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['inherit', 'inherit', 'inherit']
    })
    try {
      return await activeProcess.exited
    } finally {
      activeProcess = undefined
    }
  })

  let firstFailure = 0
  try {
    for (const [index, command] of commands.entries()) {
      if (interrupted) return interrupted === 'SIGINT' ? 130 : 143
      report(`[e2e-pglite] Running shard ${index + 1}/${commands.length}.`)
      const exitCode = await execute(command)
      if (interrupted) return interrupted === 'SIGINT' ? 130 : 143
      if (exitCode !== 0) {
        firstFailure ||= exitCode
        report(`[e2e-pglite] Shard ${index + 1}/${commands.length} failed with exit code ${exitCode}.`)
      }
    }
    if (firstFailure === 0) report('All PGlite E2E shards passed.')
    return firstFailure
  } finally {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
  }
}

if (import.meta.main) process.exitCode = await runPgliteE2eCommands(buildPgliteE2eCommands(process.argv.slice(2)))
