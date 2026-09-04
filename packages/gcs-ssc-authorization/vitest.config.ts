import { defineConfig } from 'vitest/config'

export const AUTHORIZATION_COVERAGE_INCLUDE = [
  'src/**/*.ts'
]

export const AUTHORIZATION_COVERAGE_THRESHOLDS = {
  lines: 80,
  functions: 80,
  branches: 80,
  statements: 80
} as const

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/unit/**/*.test.ts'],
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary'],
      reportsDirectory: 'coverage/unit',
      include: AUTHORIZATION_COVERAGE_INCLUDE,
      thresholds: AUTHORIZATION_COVERAGE_THRESHOLDS
    }
  }
})
