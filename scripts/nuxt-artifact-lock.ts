/* eslint-disable jsdoc/require-jsdoc */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export const NUXT_ARTIFACT_LOCK_ENV = 'GCS_SSC_NUXT_ARTIFACT_LOCK_HELD'
export const NUXT_ARTIFACT_LOCK_NAME = 'nuxt-artifact.lock'

type ArtifactLockSubprocess = Pick<Bun.Subprocess, 'exited' | 'kill'>
type ArtifactLockSpawner = (
  command: string[],
  options: Parameters<typeof Bun.spawn>[1]
) => ArtifactLockSubprocess

export const resolveNuxtArtifactLockPath = (repositoryRoot = process.cwd()): string =>
  join(repositoryRoot, '.tools', 'locks', NUXT_ARTIFACT_LOCK_NAME)

export const buildNuxtArtifactLockCommand = (
  flockPath: string,
  lockPath: string,
  command: string[]
): string[] => [flockPath, '--exclusive', '--no-fork', lockPath, ...command]

export const runWithNuxtArtifactLock = async (
  command: string[],
  environment: NodeJS.ProcessEnv = process.env,
  repositoryRoot = process.cwd(),
  spawn: ArtifactLockSpawner = (childCommand, options) => Bun.spawn(childCommand, options),
  findExecutable: (name: string) => string | null = name => Bun.which(name)
): Promise<number> => {
  if (command.length === 0) throw new Error('The Nuxt artifact lock requires a command to run.')

  const lockAlreadyHeld = environment[NUXT_ARTIFACT_LOCK_ENV] === '1'
  const flockPath = lockAlreadyHeld ? null : findExecutable('flock')
  if (!lockAlreadyHeld && !flockPath) {
    throw new Error('The Linux util-linux `flock` command is required to serialize Nuxt artifact writers.')
  }

  const lockPath = resolveNuxtArtifactLockPath(repositoryRoot)
  if (!lockAlreadyHeld) {
    await mkdir(join(repositoryRoot, '.tools', 'locks'), { recursive: true })
    console.info(`[artifact-lock] Waiting for exclusive Nuxt artifact ownership at ${lockPath}.`)
  }

  const childCommand = lockAlreadyHeld
    ? command
    : buildNuxtArtifactLockCommand(flockPath as string, lockPath, command)
  const child = spawn(childCommand, {
    cwd: repositoryRoot,
    env: { ...environment, [NUXT_ARTIFACT_LOCK_ENV]: '1' },
    stdio: ['inherit', 'inherit', 'inherit']
  })
  const forwardSignal = (signal: NodeJS.Signals): void => child.kill(signal)
  const handleSigint = (): void => forwardSignal('SIGINT')
  const handleSigterm = (): void => forwardSignal('SIGTERM')
  process.once('SIGINT', handleSigint)
  process.once('SIGTERM', handleSigterm)

  try {
    return await child.exited
  } finally {
    process.off('SIGINT', handleSigint)
    process.off('SIGTERM', handleSigterm)
  }
}

const main = async (): Promise<void> => {
  const separatorIndex = process.argv.indexOf('--')
  const command = separatorIndex === -1 ? process.argv.slice(2) : process.argv.slice(separatorIndex + 1)
  process.exitCode = await runWithNuxtArtifactLock(command)
}

if (import.meta.main) await main()
