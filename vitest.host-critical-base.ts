import { defineConfig } from 'vitest/config'

import rootConfig from './vitest.config'

export const CRITICAL_COVERAGE_THRESHOLDS = {
  lines: 80,
  functions: 80,
  branches: 80,
  statements: 80
} as const

type CriticalCoverageProject = {
  include: string[]
  reportsDirectory: string
  tests: string[]
}

/**
 * Builds an isolated root coverage project for one host-owned critical runtime.
 * @param project - Critical source universe, report path, and owner-run test set.
 * @returns A Vitest project with the shared critical thresholds.
 */
export const defineCriticalCoverageProject = (project: CriticalCoverageProject) => {
  const { include, reportsDirectory, tests } = project
  const base = rootConfig
  const toolingTests = tests.map(path => path.replace(/^tests\//, 'tooling/gcs-ssc/tests/'))

  return defineConfig({
    ...base,
    test: {
      ...base.test,
      include: toolingTests,
      maxWorkers: 1,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'json-summary'],
        reportsDirectory,
        include,
        thresholds: CRITICAL_COVERAGE_THRESHOLDS
      }
    }
  })
}
