import { spawnSync } from 'node:child_process'

/**
 * Runs a setup command and exits with the command status on failure.
 *
 * @param command - Command to run.
 * @param args - Arguments passed to the command.
 * @param cwd - Optional working directory for the command.
 */
const run = (command: string, args: string[], cwd?: string) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })

  if (result.status === null) {
    if (result.error) {
      throw result.error
    }

    throw new Error(`${command} exited without a status`)
  }

  if (result.status !== 0) {
    process.exit(result.status)
  }
}

/**
 * Reads extension and SDK submodule paths from `.gitmodules`.
 *
 * @returns Workspace submodule paths initialized by setup.
 */
const getWorkspaceSubmodulePaths = (): string[] => {
  const result = spawnSync('git', ['config', '--file', '.gitmodules', '--get-regexp', 'path'], {
    encoding: 'utf8'
  })
  if (result.status !== 0) {
    return []
  }

  return result.stdout
    .split('\n')
    .map(line => line.trim().split(/\s+/)[1])
    .filter((path): path is string => Boolean(path) && (path.startsWith('extensions/') || path === 'packages/gcs-ssc-extensions'))
}

run('bun', ['run', 'tooling:setup'])

const workspaceSubmodulePaths = getWorkspaceSubmodulePaths()

run('git', ['submodule', 'update', '--init', '--recursive', '--', ...workspaceSubmodulePaths])
run('bun', ['install'])
run('bun', ['run', 'build'], 'packages/gcs-ssc-extensions')
