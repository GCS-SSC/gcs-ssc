/* eslint-disable jsdoc/require-jsdoc */
import { isAbsolute, relative } from 'node:path'

// Vitest itself supplies the file inventory so this runner follows vitest.config.ts.
// A fresh child per file bounds PGlite PostgreSQL WASM state across the full suite.
type UnitFileProcess = Pick<Bun.Subprocess, 'exited' | 'kill'>
type UnitFileSpawner = (command: string[]) => UnitFileProcess

export const parseUnitFileInventory = (json: string, repositoryRoot = process.cwd()): string[] => {
  const entries: unknown = JSON.parse(json)
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Vitest discovered no unit test files.')
  }

  const files = entries.map((entry): string => {
    if (!entry || typeof entry !== 'object' || !('file' in entry) || typeof entry.file !== 'string'
      || !isAbsolute(entry.file)) {
      throw new Error('Vitest returned an invalid unit file inventory.')
    }
    const file = relative(repositoryRoot, entry.file).replaceAll('\\', '/')
    if (!file.startsWith('tooling/gcs-ssc/tests/unit/') || !file.endsWith('.test.ts')) {
      throw new Error(`Vitest returned a unit file outside the expected tree: ${entry.file}`)
    }
    return file
  }).sort()

  if (new Set(files).size !== files.length) {
    throw new Error('Vitest returned a duplicate unit file.')
  }
  return files
}

export const discoverUnitFiles = (repositoryRoot = process.cwd()): string[] => {
  const child = Bun.spawnSync(['bun', 'x', 'vitest', 'list', '--filesOnly', '--json'], {
    cwd: repositoryRoot,
    stdout: 'pipe',
    stderr: 'pipe'
  })
  if (child.exitCode !== 0) {
    throw new Error(`Vitest unit discovery failed: ${child.stderr.toString()}`)
  }
  return parseUnitFileInventory(child.stdout.toString(), repositoryRoot)
}

export const buildUnitFileCommand = (file: string): string[] => [
  'bun', 'x', 'vitest', 'run', '--pool=forks', '--maxWorkers=1', file
]

export const runUnitFiles = async (
  files: string[],
  spawn: UnitFileSpawner = command => Bun.spawn(command, { stdio: ['inherit', 'inherit', 'inherit'] }),
  options: { report?: (message: string) => void } = {}
): Promise<number> => {
  if (files.length === 0 || new Set(files).size !== files.length) {
    throw new Error('Unit runner requires a nonempty, unique file inventory.')
  }
  const report = options.report ?? console.info
  let activeProcess: UnitFileProcess | undefined
  let interrupted: 'SIGINT' | 'SIGTERM' | undefined
  const interrupt = (signal: 'SIGINT' | 'SIGTERM') => {
    interrupted ??= signal
    activeProcess?.kill(signal)
  }
  const onSigint = () => interrupt('SIGINT')
  const onSigterm = () => interrupt('SIGTERM')
  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)

  try {
    for (const [index, file] of files.entries()) {
      if (interrupted) return interrupted === 'SIGINT' ? 130 : 143
      report(`[unit] Running file ${index + 1}/${files.length}: ${file}`)
      activeProcess = spawn(buildUnitFileCommand(file))
      const exitCode = await activeProcess.exited
      activeProcess = undefined
      if (interrupted) return interrupted === 'SIGINT' ? 130 : 143
      if (exitCode !== 0) {
        report(`[unit] ${file} failed with exit code ${exitCode}.`)
        return exitCode
      }
    }
    report('All unit files passed.')
    return 0
  } finally {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
  }
}

if (import.meta.main) process.exitCode = await runUnitFiles(discoverUnitFiles())
