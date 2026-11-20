import type { Recommendation_Outcome } from '../types/database'

/**
 * @param input - Final review result and the pinned negative-outcome settings.
 * @param input.failOnChecklistFailure - Whether checklist failure stops the set.
 * @param input.checklistResult - The finalized checklist result, when available.
 * @param input.failureThreshold - Exclusive minimum score for a continuing assessment.
 * @param input.score - The saved final assessment score, when available.
 * @returns Whether the review makes its set unsuccessful.
 */
export const isConfiguredNegativeReview = (input: {
  failOnChecklistFailure: boolean
  checklistResult: string | null
  failureThreshold: number | null
  score: number | null
}): boolean => (input.failOnChecklistFailure && input.checklistResult === 'fail')
  || (input.failureThreshold !== null && input.score !== null && input.score < input.failureThreshold)

/**
 * @param outcome - The final recommendation, when available.
 * @param failOnNotRecommended - The pinned negative-outcome setting.
 * @returns Whether the recommendation makes its set unsuccessful.
 */
export const isConfiguredNegativeRecommendation = (outcome: Recommendation_Outcome | null | undefined, failOnNotRecommended: boolean): boolean =>
  outcome === 'not_recommended' && failOnNotRecommended
