import type { EnFrLabel } from '../common'

export type AssessmentRuntimeScoreItem = {
  name: string
  label: EnFrLabel
  rawScore: number
  weightedScore: number
  weight: number
  source: 'question' | 'calculation'
}

export type AssessmentRuntimeSubSectionScore = AssessmentRuntimeScoreItem & {
  questions: AssessmentRuntimeScoreItem[]
}

export type AssessmentRuntimeSectionScore = {
  score: AssessmentRuntimeScoreItem
  totalScore: number
  scoredSubSections: AssessmentRuntimeSubSectionScore[]
  scoreLabel: EnFrLabel
  scoreIndicator: string
}

export type AssessmentRuntimeImpactorScore = {
  target: unknown
  label: EnFrLabel
  score: number
  weight: number
  indicator: string
}

export type AssessmentRuntimeScore = {
  weightedScore: number
  totalScore: number
  scoreLabel: EnFrLabel
  scoreIndicator: string
  impactorScore: number
  impactorLabel: EnFrLabel
  impactorIndicator: string
  impactorTotalWeight: number
  impactors: AssessmentRuntimeImpactorScore[]
  scoredSections: AssessmentRuntimeSectionScore[]
}

export type AssessmentRuntimeStatus = 'empty' | 'in_progress' | 'completed'

export type AssessmentRuntimeStatusItem = {
  name: string
  label: EnFrLabel
  status: AssessmentRuntimeStatus
}

export type AssessmentRuntimeReviewStatusName =
  | 'review_alignment'
  | 'additional_reviewers'
  | 'completion'

export type AssessmentRuntimeReviewStatusItem = AssessmentRuntimeStatusItem & {
  name: AssessmentRuntimeReviewStatusName
  totalCount?: number
  pendingCount?: number
}

export type AssessmentRuntimeReviewContext = {
  reviewAlignmentDisabled?: boolean
  reviewersDisabled?: boolean
  totalAdditionalReviewerCount?: number
  pendingAdditionalReviewerCount?: number
  isReviewLocked?: boolean
}

export type AssessmentRuntimeSectionStatus = AssessmentRuntimeStatusItem & {
  subSections: AssessmentRuntimeStatusItem[]
  icon: string
}

export type AssessmentRuntimeAnswer = {
  section: string
  subsection: string
  question: string
  value: number | null
  comment: string
}

export type AssessmentRuntimeCalculatedAnswer = {
  section: string
  subsection: string
  question: string
  value: number
}

export type AssessmentRuntimeOutcomeBase = {
  section: string
  subsection: string
  nameEn: string
  nameFr: string
  recommendedStrategy: string
  selectedStrategy: string
  accepted: boolean
  justification: string
  comment: string
}

export type AssessmentRuntimeOutcome = AssessmentRuntimeOutcomeBase

export type AssessmentRuntimeOutcomeOption = {
  value: string
  label: EnFrLabel
}

export type AssessmentRuntimeGeneratedOutcome = AssessmentRuntimeOutcomeBase & {
  sectionLabel: EnFrLabel
  subsectionLabel: EnFrLabel
  recommendedLabel: EnFrLabel
  options: AssessmentRuntimeOutcomeOption[]
}

export type AssessmentRuntimeBlockingIssue = {
  path: Array<string | number>
  message: string
  params?: Record<string, unknown>
}

export type AssessmentRuntimeSummary = {
  sectionStatuses: AssessmentRuntimeSectionStatus[]
  outcomesStatus: AssessmentRuntimeStatus
  outcomeStatuses: AssessmentRuntimeStatusItem[]
  reviewStatus: AssessmentRuntimeStatus
  reviewStatuses: AssessmentRuntimeReviewStatusItem[]
  score: AssessmentRuntimeScore
  calculatedAnswers: AssessmentRuntimeCalculatedAnswer[]
  generatedOutcomes: AssessmentRuntimeGeneratedOutcome[]
  answersComplete: boolean
  outcomesAvailable: boolean
  outcomesComplete: boolean
  readyToComplete: boolean
  blockingIssues: AssessmentRuntimeBlockingIssue[]
}
