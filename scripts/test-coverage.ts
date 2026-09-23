/* eslint-disable jsdoc/require-jsdoc */
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { discoverUnitFiles } from './test-unit'

// Keep PGlite WASM state bounded to one Vitest child while retaining mergeable V8 coverage.
type CoverageProcess = Pick<Bun.Subprocess, 'exited' | 'kill'>
type SpawnOptions = { env?: NodeJS.ProcessEnv }
type CoverageSpawner = (command: string[], options?: SpawnOptions) => CoverageProcess

export const buildCoverageFileCommand = (file: string, blobPath: string, reportDirectory: string): string[] => [
  'bun', 'x', 'vitest', 'run', '--pool=forks', '--maxWorkers=1', file,
  '--coverage', '--reporter=default', '--reporter=blob',
  `--outputFile.blob=${blobPath}`,
  '--coverage.thresholds.lines=0',
  '--coverage.thresholds.functions=0',
  '--coverage.thresholds.branches=0',
  '--coverage.thresholds.statements=0',
  '--coverage.reporter=json-summary',
  `--coverage.reportsDirectory=${reportDirectory}`
]

export const buildCoverageMergeCommand = (blobDirectory: string): string[] => [
  'bun', 'x', 'vitest', '--mergeReports', blobDirectory, '--coverage'
]

const defaultSpawner: CoverageSpawner = (command, options) => Bun.spawn(command, {
  stdio: ['inherit', 'inherit', 'inherit'],
  ...(options?.env ? { env: options.env } : {})
})

export const runCoverageFiles = async (
  files: string[],
  spawn: CoverageSpawner = defaultSpawner,
  options: { report?: (message: string) => void, scratchRoot?: string } = {}
): Promise<number> => {
  if (files.length === 0 || new Set(files).size !== files.length) {
    throw new Error('Coverage runner requires a nonempty, unique file inventory.')
  }

  const report = options.report ?? console.info
  const scratchDirectory = await mkdtemp(join(options.scratchRoot ?? '/var/tmp', 'gcs-coverage-'))
  const blobDirectory = join(scratchDirectory, 'blobs')
  const perFileReportDirectory = join(scratchDirectory, 'per-file')
  let activeProcess: CoverageProcess | undefined
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
    await mkdir(blobDirectory)
    for (const [index, file] of files.entries()) {
      if (interrupted) return interrupted === 'SIGINT' ? 130 : 143
      const blobPath = join(blobDirectory, `${String(index + 1).padStart(4, '0')}.blob`)
      report(`[coverage] Running file ${index + 1}/${files.length}: ${file}`)
      activeProcess = spawn(buildCoverageFileCommand(file, blobPath, perFileReportDirectory))
      const exitCode = await activeProcess.exited
      activeProcess = undefined
      if (interrupted) return interrupted === 'SIGINT' ? 130 : 143
      if (exitCode !== 0) {
        report(`[coverage] ${file} failed with exit code ${exitCode}.`)
        return exitCode
      }
    }

    if (interrupted) return interrupted === 'SIGINT' ? 130 : 143
    report('[coverage] Merging V8 coverage and checking configured thresholds.')
    const nodeOptions = [process.env.NODE_OPTIONS?.trim(), '--max-old-space-size=12288']
      .filter(Boolean).join(' ')
    activeProcess = spawn(buildCoverageMergeCommand(blobDirectory), {
      env: { ...process.env, NODE_OPTIONS: nodeOptions }
    })
    const mergeExitCode = await activeProcess.exited
    activeProcess = undefined
    if (interrupted) return interrupted === 'SIGINT' ? 130 : 143
    if (mergeExitCode !== 0) {
      report(`[coverage] Merged coverage failed with exit code ${mergeExitCode}.`)
      return mergeExitCode
    }
    report('All unit coverage files passed and merged thresholds were met.')
    return 0
  } finally {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
    await rm(scratchDirectory, { recursive: true, force: true })
  }
}

if (import.meta.main) process.exitCode = await runCoverageFiles(discoverUnitFiles())
