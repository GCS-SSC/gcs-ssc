import { defineCriticalCoverageProject } from './vitest.host-critical-base'

export const WORKFLOW_RUNTIME_COVERAGE_INCLUDE = [
  'server/utils/workflow-runtime.ts',
  'server/utils/workflow-routing.ts',
  'server/utils/workflow-routing-capture.ts',
  'server/utils/workflow-condition-evaluation.ts',
  'server/utils/workflow-execution-plan.ts',
  'server/utils/correction-completion.ts',
  'server/utils/correction-lock.ts',
  'server/utils/correction-posting.ts',
  'server/utils/correction-notifications.ts',
  'server/utils/correction.ts',
  'server/utils/agreement-accounting-projection.ts'
]

export default defineCriticalCoverageProject({
  include: WORKFLOW_RUNTIME_COVERAGE_INCLUDE,
  reportsDirectory: 'coverage/workflow-runtime',
  tests: [
    // Exercise independently owned AR/Credit Memo workflows and their real
    // posting/upgrade paths, alongside the existing Agreement runtime cases.
    'tests/unit/account-receivable-credit-memo-workflow-selection.test.ts',
    'tests/unit/account-receivable-pool-ledger.test.ts',
    'tests/unit/account-receivable-accounting.test.ts',
    'tests/unit/account-receivable-host-financial-projection.test.ts',
    'tests/unit/seed-payment-recording-runtime.test.ts',
    'tests/unit/workflow-amendment-conditions.test.ts',
    'tests/unit/workflow-routing.test.ts',
    'tests/unit/correction-lifecycle.test.ts',
    'tests/unit/correction-lifecycle-refusal.test.ts',
    'tests/unit/correction-domain.test.ts',
    'tests/unit/correction-accounting.test.ts',
    'tests/unit/correction-financial-projection.test.ts',
    'tests/unit/correction-notifications.test.ts',
    'tests/unit/workflow-status-graph.test.ts',
    'tests/unit/workflow-routing-contracts.test.ts',
    'tests/unit/workflow-profile-database.test.ts',
    'tests/unit/agreement-amendment-cancel-route-coverage.test.ts',
    'tests/unit/agreement-approval-submission-locking.test.ts',
    'tests/unit/agreement-write-transaction.test.ts',
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
