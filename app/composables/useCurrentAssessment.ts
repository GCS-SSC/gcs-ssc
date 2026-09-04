import { computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { AssessmentDefinition, ScoringMatrixItem } from '#shared/types/schemas/assessment/assessment'
import type { AssessmentResponse } from '#shared/types/schemas/assessment/assessmentresponse'
import type {
  AssessmentRuntimeGeneratedOutcome,
  AssessmentRuntimeReviewContext,
  AssessmentRuntimeScore,
  AssessmentRuntimeSummary
} from '#shared/types/schemas/assessment/currentassessment'
import {
  buildAssessmentRuntimeSummary
} from '~~/shared/utils/assessment'

/**
 * Derives runtime assessment state from the current assessment response and active schema.
 *
 * @param response - Mutable assessment answers and outcomes being edited on the page.
 * @param schema - Active assessment definition, or `null` until the review loads.
 * @param scoringMatrix - Active scoring matrix aligned to the selected assessment schema version.
 * @param helpers - Helper field values supplied by the review context.
 * @param reviewContext - Server-owned runtime activity context that augments the local assessment state.
 * @returns Computed runtime summary values used by the assessment UI.
 */
export const useCurrentAssessment = (
  response: Ref<AssessmentResponse>,
  schema: Ref<AssessmentDefinition | null>,
  scoringMatrix: Ref<ScoringMatrixItem[]>,
  helpers: Ref<Record<string, unknown> | null>,
  reviewContext: Ref<AssessmentRuntimeReviewContext | null>
) => {
  const runtimeSummary: ComputedRef<AssessmentRuntimeSummary | null> = computed(() => {
    if (!schema.value) {
      return null
    }

    return buildAssessmentRuntimeSummary(response.value, {
      ...schema.value,
      scoringMatrix: scoringMatrix.value
    }, helpers.value, reviewContext.value ?? undefined)
  })

  const currentScore: ComputedRef<AssessmentRuntimeScore | null> = computed(() => runtimeSummary.value?.score ?? null)
  const generatedOutcomes: ComputedRef<AssessmentRuntimeGeneratedOutcome[]> = computed(() => runtimeSummary.value?.generatedOutcomes ?? [])

  return {
    runtimeSummary,
    currentScore,
    generatedOutcomes
  }
}
