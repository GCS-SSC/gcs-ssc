import { defineCriticalCoverageProject } from './vitest.host-critical-base'

export const WORKFLOW_RUNTIME_COVERAGE_INCLUDE = [
  'server/utils/workflow-runtime.ts'
]

export default defineCriticalCoverageProject({
  include: WORKFLOW_RUNTIME_COVERAGE_INCLUDE,
  reportsDirectory: 'coverage/workflow-runtime',
  tests: [
    'tests/unit/agreement-amendment-cancel-route-coverage.test.ts',
    'tests/unit/agreement-approval-submission-locking.test.ts',
    'tests/unit/agreement-claim-completion.test.ts',
    'tests/unit/agreement-claim-reconcile-completion.test.ts',
    'tests/unit/agreement-claim-reconciliation-cancel.test.ts',
    'tests/unit/agreement-claim-utils.test.ts',
    'tests/unit/agreement-closeout-routes.test.ts',
    'tests/unit/agreement-commitment-completion.test.ts',
    'tests/unit/agreement-forecast-completion.test.ts',
    'tests/unit/agreement-monitor-completion.test.ts',
    'tests/unit/agreement-payment-completion.test.ts',
    'tests/unit/approval-submission-access-and-errors.test.ts',
    'tests/unit/assigned-item-detail-routes.test.ts',
    'tests/unit/completion-runtime-routes.test.ts',
    'tests/unit/recommendation-runtime.test.ts',
    'tests/unit/review-approval-runtime-routes.test.ts',
    'tests/unit/workflow-completion-transition.test.ts',
    'tests/unit/workflow-owner-recovery-routes.test.ts',
    'tests/unit/workflow-runtime-coverage.test.ts',
    'tests/unit/workflow-runtime-planning.test.ts',
    'tests/unit/workflow-runtime-routes.test.ts'
  ]
})
