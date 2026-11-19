import type { RuntimeState } from '~~/shared/constants/system-lifecycle'
import type { AssessmentResponse } from '~~/shared/types/schemas/assessment/assessmentresponse'
import type { ChecklistResponse } from '~~/shared/types/schemas/checklist/checklist'

export type ReviewCopyChoice = {
  id: string
  completedAt: string
  outcome: RuntimeState
  isLatest: boolean
}

export type ReviewCopyResult =
  | { kind: 'choices'; choices: ReviewCopyChoice[] }
  | { kind: 'no_history' | 'version_mismatch' }
  | { kind: 'assessment'; response: AssessmentResponse }
  | { kind: 'checklist'; response: ChecklistResponse[] }
