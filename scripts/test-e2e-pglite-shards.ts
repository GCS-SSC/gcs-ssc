import { lifecycleFixturePgliteE2eSpecPaths, resolveE2eTestSelection } from './test-e2e'

const SHARD_COUNT = 8
const managedCommand = ['bun', 'run', 'scripts/test-e2e.ts', '--suite', 'pglite'] as const

const selectionReducingOptions = new Set([
  '--grep', '-g', '--grep-invert', '--test-list', '--test-list-invert',
  '--last-failed', '--only-changed', '--project', '--config', '-c'
])
const isSelectionReducingOption = (arg: string): boolean =>
  selectionReducingOptions.has(arg.split('=')[0]!)
  || (arg.startsWith('-g') && !arg.startsWith('--') && arg.length > 2)
  || (arg.startsWith('-c') && !arg.startsWith('--') && arg.length > 2)

type E2eCommandRunner = (command: string[]) => Promise<number>

/**
 * Preserves focused selections while bounding a full PGlite run to fresh managed shards.
 * @param args - Playwright arguments forwarded by the package command.
 * @param environment - Environment used to detect an explicit focused spec.
 * @returns One focused command, or ordinary shards plus one per-spec lifecycle group.
 */
export const buildPgliteE2eCommands = (
  args: string[],
  environment: NodeJS.ProcessEnv = process.env
): string[][] => {
  const unsharded = args.includes('--unsharded')
  if (args.filter(arg => arg === '--unsharded').length > 1 || args.some(arg => arg.startsWith('--unsharded='))) {
    throw new Error('--unsharded may be supplied only once, without a value.')
  }
  const forwarded = args.filter(arg => arg !== '--unsharded')
  const specFromEnv = environment.E2E_SPEC?.trim() || undefined
  const specIndex = forwarded.indexOf('--spec')
  const selectedSpec = specIndex >= 0 ? forwarded[specIndex + 1] : specFromEnv
  const lifecycle = lifecycleFixturePgliteE2eSpecPaths.some(path => path === selectedSpec)
  // Validate exact selection/flags using the leaf; wrapper flags never reach it.
  resolveE2eTestSelection(['--suite', lifecycle ? 'fresh-reset' : 'pglite', ...forwarded], specFromEnv)
  if (!selectedSpec && forwarded.some(isSelectionReducingOption)) {
    throw new Error('Selection-reducing Playwright filters require one exact --spec (or E2E_SPEC); choose the owning file before filtering its tests instead of filtering every isolated lifecycle file.')
  }
  if (selectedSpec) {
    return [[...(lifecycle ? ['bun', 'run', 'scripts/test-e2e-fresh-reset.ts'] : managedCommand), ...forwarded]]
  }
  const explicitShard = forwarded.some(arg => arg === '--shard' || arg.startsWith('--shard='))
  // An explicit ordinary partition intentionally omits the lifecycle group.
  // It is a partial selection, never the full aggregate inventory.
  if (explicitShard) return [[...managedCommand, ...forwarded]]
  const ordinary = unsharded
    ? [[...managedCommand, ...forwarded]]
    : Array.from({ length: SHARD_COUNT }, (_, index) => [
        ...managedCommand, ...forwarded, '--shard', `${index + 1}/${SHARD_COUNT}`
      ])
  return [...ordinary, ['bun', 'run', 'scripts/test-e2e-fresh-reset.ts', '--group', 'lifecycle', ...forwarded]]
}

/**
 * Runs every managed batch serially and fails the aggregate if any invocation fails.
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
      report(`[e2e-pglite] Running managed batch ${index + 1}/${commands.length}.`)
      const exitCode = await execute(command)
      if (interrupted) return interrupted === 'SIGINT' ? 130 : 143
      if (exitCode !== 0) {
        firstFailure ||= exitCode
        report(`[e2e-pglite] Managed batch ${index + 1}/${commands.length} failed with exit code ${exitCode}.`)
      }
    }
    if (firstFailure === 0) report('All PGlite E2E batches passed.')
    return firstFailure
  } finally {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
  }
}

if (import.meta.main) process.exitCode = await runPgliteE2eCommands(buildPgliteE2eCommands(process.argv.slice(2)))
