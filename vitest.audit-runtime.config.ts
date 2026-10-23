import { defineCriticalCoverageProject } from './vitest.host-critical-base'

export const AUDIT_RUNTIME_COVERAGE_INCLUDE = [
  'server/utils/audit-*.ts',
  'server/utils/access-log-*.ts',
  'server/database/access-log-schema.ts',
  'server/database/audit-*.ts',
  'server/database/extension-audit-ownership.ts'
]

export default defineCriticalCoverageProject({
  include: AUDIT_RUNTIME_COVERAGE_INCLUDE,
  reportsDirectory: 'coverage/audit-runtime',
  tests: [
    'tests/unit/audit-*.test.ts',
    'tests/unit/agency-audit.test.ts',
    'tests/unit/access-log-*.test.ts',
    'tests/unit/extension-audit-*.test.ts',
    'tests/unit/storage-cleanup-worker-*.test.ts',
    'tests/unit/assigned-list-views.test.ts'
  ]
})
