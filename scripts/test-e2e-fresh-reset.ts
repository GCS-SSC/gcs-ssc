/* eslint-disable jsdoc/require-jsdoc */
import { freshResetE2eSpecPaths, lifecycleFixturePgliteE2eSpecPaths, postgresE2eSpecPaths, resolveE2eTestSelection } from './test-e2e'

type FreshResetSubprocess = Pick<Bun.Subprocess, 'exited' | 'kill'>
type FreshResetSpawner = (
  command: string[],
  options: Parameters<typeof Bun.spawn>[1]
) => FreshResetSubprocess

type FreshResetSignalHandlers = Record<'SIGINT' | 'SIGTERM', () => void>
type FreshResetOrchestrationHooks = {
  registerSignalHandlers: (handlers: FreshResetSignalHandlers) => () => void
  yieldToSignalHandlers: () => Promise<void>
}

const defaultOrchestrationHooks: FreshResetOrchestrationHooks = {
  registerSignalHandlers: handlers => {
    process.once('SIGINT', handlers.SIGINT)
    process.once('SIGTERM', handlers.SIGTERM)
    return () => {
      process.off('SIGINT', handlers.SIGINT)
      process.off('SIGTERM', handlers.SIGTERM)
    }
  },
  yieldToSignalHandlers: async () => {
    await new Promise<void>(resolve => setImmediate(resolve))
  }
}

const buildFreshResetChildEnvironment = (environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const childEnvironment = { ...environment, PLAYWRIGHT_WORKERS: '1' }
  delete childEnvironment.PGLITE_DATA_DIR
  delete childEnvironment.GCS_LOCAL_FILE_STORAGE_DIR
  delete childEnvironment.PLAYWRIGHT_BASE_URL
  delete childEnvironment.E2E_SPEC
  return childEnvironment
}

const signalExitCode = (signal: 'SIGINT' | 'SIGTERM'): number => signal === 'SIGINT' ? 130 : 143

const selectionReducingOptions = new Set([
  '--grep', '-g', '--grep-invert', '--test-list', '--test-list-invert',
  '--last-failed', '--only-changed', '--project', '--config', '-c'
])
const isSelectionReducingOption = (arg: string): boolean =>
  selectionReducingOptions.has(arg.split('=')[0]!)
  || (arg.startsWith('-g') && !arg.startsWith('--') && arg.length > 2)
  || (arg.startsWith('-c') && !arg.startsWith('--') && arg.length > 2)

export type FreshResetSuite = 'fresh-reset' | 'postgres'
type FreshResetGroup = 'all' | 'lifecycle' | 'standalone'
export type FreshResetExecutionOptions = {
  suite?: FreshResetSuite
  forwardedPlaywrightArgs?: string[]
}
export type FreshResetSelection = {
  suite: FreshResetSuite
  group: FreshResetGroup
  specPaths: string[]
  forwardedPlaywrightArgs: string[]
}

export const buildFreshResetE2eCommand = (
  specPath: string,
  suite: FreshResetSuite = 'fresh-reset',
  forwardedPlaywrightArgs: string[] = []
): string[] => {
  // The leaf owns canonical path, suite membership and Playwright flag validation.
  resolveE2eTestSelection(['--suite', suite, '--spec', specPath, ...forwardedPlaywrightArgs])
  return ['bun', 'run', 'scripts/test-e2e.ts', '--suite', suite, '--spec', specPath, ...forwardedPlaywrightArgs]
}

export const resolveFreshResetE2eSelection = (
  rawArgs: string[],
  specFromEnv?: string
): FreshResetSelection => {
  let suite: FreshResetSuite = 'fresh-reset'
  let group: FreshResetGroup = 'all'
  let explicitSuite = false
  let explicitGroup = false
  let selectedSpec: string | undefined
  const forwarded: string[] = []
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index]!
    if (['--suite', '--group', '--spec'].some(option => arg.startsWith(`${option}=`))) {
      throw new Error(`${arg.split('=')[0]} requires its value as the next argument.`)
    }
    if (arg === '--suite' || arg === '--group' || arg === '--spec') {
      const value = rawArgs[++index]
      if (!value || value.startsWith('-')) throw new Error(`Missing value for ${arg}.`)
      if (arg === '--suite') {
        if (explicitSuite) throw new Error('--suite may be supplied only once.')
        if (value !== 'fresh-reset' && value !== 'postgres') throw new Error('Expected --suite fresh-reset or postgres.')
        suite = value
        explicitSuite = true
      } else if (arg === '--group') {
        if (explicitGroup) throw new Error('--group may be supplied only once.')
        if (value !== 'all' && value !== 'lifecycle' && value !== 'standalone') throw new Error('Expected --group all, lifecycle or standalone.')
        group = value
        explicitGroup = true
      } else {
        if (selectedSpec !== undefined) throw new Error('--spec may be supplied only once.')
        selectedSpec = value
      }
    } else {
      forwarded.push(arg)
    }
  }
  if (suite === 'postgres' && explicitGroup) throw new Error('--group applies only to the fresh-reset suite.')
  if (selectedSpec && specFromEnv) throw new Error('Use either --spec or E2E_SPEC, not both.')
  selectedSpec ??= specFromEnv
  const lifecycle = new Set<string>(lifecycleFixturePgliteE2eSpecPaths)
  const candidates = suite === 'postgres'
    ? [...postgresE2eSpecPaths]
    : freshResetE2eSpecPaths.filter(path => group === 'all' || (group === 'lifecycle' ? lifecycle.has(path) : !lifecycle.has(path)))
  if (selectedSpec && !candidates.some(path => path === selectedSpec)) {
    throw new Error(`The ${suite}/${group} lane does not own ${selectedSpec}.`)
  }
  const specPaths = selectedSpec ? [selectedSpec] : candidates
  if (specPaths.length === 0) throw new Error('The managed per-spec selection must not be empty.')
  // Preserve the leaf's malformed-flag diagnostics before aggregate policy.
  buildFreshResetE2eCommand(specPaths[0]!, suite, forwarded)
  if (!selectedSpec && forwarded.some(arg => isSelectionReducingOption(arg) || arg.split('=')[0] === '--shard')) {
    throw new Error('Selection-reducing Playwright filters require one exact --spec (or E2E_SPEC) in the per-spec reset runner; choose the owning file before filtering its tests.')
  }
  // Validate before starting any managed child, including aggregate filter flags.
  for (const path of specPaths) buildFreshResetE2eCommand(path, suite, forwarded)
  return { suite, group, specPaths, forwardedPlaywrightArgs: forwarded }
}

export const resolveFreshResetE2eSpecPaths = (rawArgs: string[]): string[] =>
  resolveFreshResetE2eSelection(rawArgs).specPaths

export const runFreshResetE2eSpecs = async (
  specPaths: string[],
  environment: NodeJS.ProcessEnv = process.env,
  repositoryRoot = process.cwd(),
  spawn: FreshResetSpawner = (command, options) => Bun.spawn(command, options),
  hooks: FreshResetOrchestrationHooks = defaultOrchestrationHooks,
  options: FreshResetExecutionOptions = {}
): Promise<number> => {
  if (specPaths.length === 0) throw new Error('The managed per-spec selection must not be empty.')
  const commands = specPaths.map(path => buildFreshResetE2eCommand(path, options.suite, options.forwardedPlaywrightArgs))
  let activeProcess: FreshResetSubprocess | undefined
  let interruptedSignal: 'SIGINT' | 'SIGTERM' | undefined
  const forwardSignal = (signal: 'SIGINT' | 'SIGTERM'): void => {
    interruptedSignal ??= signal
    activeProcess?.kill(signal)
  }
  const handleSigint = (): void => forwardSignal('SIGINT')
  const handleSigterm = (): void => forwardSignal('SIGTERM')
  const unregisterSignalHandlers = hooks.registerSignalHandlers({
    SIGINT: handleSigint,
    SIGTERM: handleSigterm
  })

  try {
    for (const [index, specPath] of specPaths.entries()) {
      if (interruptedSignal) return signalExitCode(interruptedSignal)
      console.info(`[fresh-reset] Running ${specPath} in a fresh managed lifecycle.`)
      activeProcess = spawn(commands[index]!, {
        cwd: repositoryRoot,
        env: buildFreshResetChildEnvironment(environment),
        stdio: ['inherit', 'inherit', 'inherit']
      })
      const exitCode = await activeProcess.exited
      activeProcess = undefined
      if (exitCode !== 0) return exitCode
      if (interruptedSignal) return signalExitCode(interruptedSignal)
      if (index < specPaths.length - 1) {
        await hooks.yieldToSignalHandlers()
        if (interruptedSignal) return signalExitCode(interruptedSignal)
      }
    }
    return 0
  } finally {
    unregisterSignalHandlers()
  }
}

const main = async (): Promise<void> => {
  const selection = resolveFreshResetE2eSelection(process.argv.slice(2), process.env.E2E_SPEC?.trim() || undefined)
  process.exitCode = await runFreshResetE2eSpecs(selection.specPaths, process.env, process.cwd(), undefined, undefined, selection)
}

if (import.meta.main) await main()
