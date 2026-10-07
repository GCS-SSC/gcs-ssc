import type { RuntimeState } from '~~/shared/constants/system-lifecycle'

export type RiskTarget = {
  entityType: 'fundingcaseagreement' | 'fundingcaseamendment'
  entityId: string
}

export type RiskReadiness = {
  ready: boolean
  required: boolean
  workflowManaged: boolean
  setupId: string | null
  publicationVersionId: string | null
  successfulRuntimeId: string | null
  blocker: 'risk_workflow_required' | 'risk_score_required' | null
  evidence: {
    runtimeId: string
    setupId: string
    publicationVersionId: string
    state: 'succeeded' | 'approved'
    completedAt: string | null
  } | null
}

export type SubmissionRisk = {
  version: 1
  enabled: boolean
  apply: boolean
  proposedScore: number | null
  rating: { id: string, score: number, label: { en: string, fr: string } } | null
  calculationSource: {
    runtimeId: string
    status: RuntimeState
    completedAt: string | null
    workflowName: { en: string, fr: string }
    assessmentScore: number | null
    mappedRating: { id: string, score: number, label: { en: string, fr: string } } | null
  } | null
  readiness: RiskReadiness
}

export type AgreementRiskSource = { kind: 'manual' } | {
  kind: 'workflow'
  runtimeId: string
  workflowName: { en: string, fr: string }
  calculationSource: SubmissionRisk['calculationSource']
  rating: SubmissionRisk['rating']
} | {
  kind: 'amendment'
  amendmentId: string
  amendmentNumber: number
  approvedAt: Date | string | null
  workflowName: { en: string, fr: string } | null
  calculationSource: SubmissionRisk['calculationSource']
  rating: SubmissionRisk['rating']
}
