import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const postgresSuiteDefinitions = [
  {
    name: 'root agreement concurrency',
    environmentVariable: 'AGREEMENT_CONCURRENCY_POSTGRES_TEST_URL',
    workingDirectory: '.',
    script: 'test:integration:postgres:root'
  }
] as const

type PostgresSuiteEnvironment = Record<string, string | undefined>

/**
 * Validates every disposable PostgreSQL URL required by the manual suites.
 *
 * @param environment Environment variables containing the three suite URLs.
 * @returns The validated URL map.
 */
export const resolvePostgresSuiteUrls = (
  environment: PostgresSuiteEnvironment
): Record<(typeof postgresSuiteDefinitions)[number]['environmentVariable'], string> => {
  const resolved = {} as Record<
    (typeof postgresSuiteDefinitions)[number]['environmentVariable'],
    string
  >
  const errors: string[] = []

  for (const suite of postgresSuiteDefinitions) {
    const value = environment[suite.environmentVariable]
    if (!value) {
      errors.push(`${suite.environmentVariable} is required for ${suite.name}.`)
      continue
    }
    try {
      const url = new URL(value)
      const databaseName = decodeURIComponent(url.pathname).split('/').filter(Boolean).at(-1) ?? ''
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !databaseName.endsWith('_test')) {
        errors.push(`${suite.environmentVariable} must be a PostgreSQL URL whose database name ends in _test.`)
        continue
      }
      resolved[suite.environmentVariable] = value
    } catch {
      errors.push(`${suite.environmentVariable} must be a valid PostgreSQL URL.`)
    }
  }

  if (errors.length > 0) {
    throw new Error([
      'Main-application PostgreSQL verification requires an explicitly configured disposable database.',
      ...errors,
      'Extension PostgreSQL suites are owned and executed by their standalone repositories.'
    ].join('\n'))
  }

  return resolved
}

/**
 * Runs the main-application PostgreSQL suite with an explicit database URL.
 *
 * @param environment Environment variables forwarded to each suite.
 */
export const runPostgresSuites = async (
  environment: PostgresSuiteEnvironment = process.env
): Promise<void> => {
  const urls = resolvePostgresSuiteUrls(environment)
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

  for (const suite of postgresSuiteDefinitions) {
    const child = Bun.spawn({
      cmd: ['bun', 'run', suite.script],
      cwd: resolve(repositoryRoot, suite.workingDirectory),
      env: {
        ...process.env,
        ...environment,
        [suite.environmentVariable]: urls[suite.environmentVariable]
      },
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit'
    })
    const exitCode = await child.exited
    if (exitCode !== 0) {
      throw new Error(`${suite.name} PostgreSQL suite failed with exit code ${exitCode}.`)
    }
  }
}

if (import.meta.main) {
  await runPostgresSuites()
}
