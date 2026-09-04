/* eslint-disable jsdoc/require-jsdoc */
import { freshResetE2eSpecPaths } from './test-e2e'

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

export const resolveFreshResetE2eSpecPaths = (rawArgs: string[]): string[] => {
  if (rawArgs.length === 0) return [...freshResetE2eSpecPaths]
  if (rawArgs.length !== 2 || rawArgs[0] !== '--spec') {
    throw new Error('Expected no arguments or --spec followed by one exact fresh-reset E2E spec path.')
  }
  const selectedSpec = rawArgs[1]!
  if (!freshResetE2eSpecPaths.some(specPath => specPath === selectedSpec)) {
    throw new Error(`The fresh-reset lane does not own ${selectedSpec}.`)
  }
  return [selectedSpec]
}

export const buildFreshResetE2eCommand = (specPath: string): string[] => [
  'bun',
  'run',
  'scripts/test-e2e.ts',
  '--suite',
  'fresh-reset',
  '--spec',
  specPath
]

export const runFreshResetE2eSpecs = async (
  specPaths: string[],
  environment: NodeJS.ProcessEnv = process.env,
  repositoryRoot = process.cwd(),
  spawn: FreshResetSpawner = (command, options) => Bun.spawn(command, options),
  hooks: FreshResetOrchestrationHooks = defaultOrchestrationHooks
): Promise<number> => {
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
      activeProcess = spawn(buildFreshResetE2eCommand(specPath), {
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
  const specPaths = resolveFreshResetE2eSpecPaths(process.argv.slice(2))
  process.exitCode = await runFreshResetE2eSpecs(specPaths)
}

if (import.meta.main) await main()
