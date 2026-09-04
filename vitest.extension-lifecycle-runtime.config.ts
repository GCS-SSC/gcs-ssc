import { defineCriticalCoverageProject } from './vitest.host-critical-base'

export const EXTENSION_LIFECYCLE_RUNTIME_COVERAGE_INCLUDE = [
  'server/utils/extension-lifecycle-runtime.ts'
]

export default defineCriticalCoverageProject({
  include: EXTENSION_LIFECYCLE_RUNTIME_COVERAGE_INCLUDE,
  reportsDirectory: 'coverage/extension-lifecycle-runtime',
  tests: [
    'tests/unit/extension-lifecycle-runtime.test.ts'
  ]
})
