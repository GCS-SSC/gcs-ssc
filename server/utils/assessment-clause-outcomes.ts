import type { JsonValue } from '~~/shared/types/database'
import { assessmentClauseOutcomeKey } from '~~/shared/types/schemas/agency-review-clause-rule'
import { OutcomeSchema } from '~~/shared/types/schemas/assessment/assessment'
import { readPublishedReviewSchema } from './review-schema-versioning'

/**
 * Projects authored outcome choices from a pinned Assessment publication.
 * @param publication Published Review Schema definition.
 * @returns Stable outcome codes and localized strategy options.
 */
export const readAssessmentClauseOutcomes = (publication: JsonValue) => {
  const definition = readPublishedReviewSchema(publication)
  const assessment = definition?.assessmentSchema
  const outcomes = assessment && typeof assessment === 'object' && !Array.isArray(assessment)
    ? OutcomeSchema.array().safeParse(assessment.outcomes)
    : null
  return outcomes?.success
    ? outcomes.data.flatMap(group => group.strategies.map(outcome => ({
        id: assessmentClauseOutcomeKey(group.name, outcome.name),
        label_en: `${group.label.en} — ${outcome.label.en}`,
        label_fr: `${group.label.fr} — ${outcome.label.fr}`,
        strategies: outcome.options.filter(option => option.value !== '')
      })))
    : []
}
