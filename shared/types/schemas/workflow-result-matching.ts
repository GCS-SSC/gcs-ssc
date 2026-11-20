import type { WorkflowResultCondition } from './agreement-custom-fields'
import type { ChecklistResult } from './checklist/checklist'

/**
 * @param condition - Predicate pinned in the workflow publication.
 * @param actual - Final value from this attempt, or null for a skipped source.
 * @returns Whether the source produced a value that satisfies the predicate.
 */
export const matchWorkflowResult = (condition: WorkflowResultCondition, actual: number | boolean | ChecklistResult | null): boolean => {
  switch (condition.source) {
    case 'checklist_result':
      return typeof actual === 'string' && condition.values.includes(actual)
    case 'recommendation_result':
      return actual === condition.value
    case 'assessment_score':
      if (typeof actual !== 'number') return false
      switch (condition.operator) {
        case 'eq': return actual === condition.value
        case 'lt': return actual < condition.value
        case 'lte': return actual <= condition.value
        case 'gt': return actual > condition.value
        case 'gte': return actual >= condition.value
      }
  }
}
