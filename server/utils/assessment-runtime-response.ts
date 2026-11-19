import type { H3Event } from 'h3'
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { parseSafeDecimal } from '~~/shared/utils/decimal'
import { prepareAssessmentPersistence, type AssessmentMutationReview } from './assessment-runtime-persistence'
import { badRequest } from './api-errors'
import type { AssessmentResponse } from '~~/shared/types/schemas/assessment/assessmentresponse'

/**
 * Loads editable assessment evidence, excluding calculated answers.
 * @param db - Database connection.
 * @param review - Review identity and alignment fields.
 * @returns The editable assessment response.
 */
export const loadAssessmentResponse = async (
  db: Kysely<Database>,
  review: Pick<AssessmentMutationReview, 'id' | 'egcs_cn_reviewalignment' | 'egcs_cn_reviewalignresult' | 'egcs_cn_reviewalignmentnarrative'>
) => {
  const egcsCnReviewAlignment = review.egcs_cn_reviewalignment === true
  const egcsCnReviewAlignResult = review.egcs_cn_reviewalignresult === null || review.egcs_cn_reviewalignresult === undefined
    ? null
    : parseSafeDecimal(String(review.egcs_cn_reviewalignresult))
  const egcsCnReviewAlignmentNarrative = review.egcs_cn_reviewalignmentnarrative ?? ''

  const [responses, outcomes, customOutcomes] = await Promise.all([
    db
      .selectFrom('Common_Review_Response')
      .select([
        'egcs_cn_section as section',
        'egcs_cn_subsection as subsection',
        'egcs_cn_question as question',
        'egcs_cn_value as value',
        'egcs_cn_comment as comment',
        'egcs_cn_calculated as calculated'
      ])
      .where('egcs_cn_assessment', '=', String(review.id))
      .where('Common_Review_Response._deleted', '=', false)
      .execute(),
    db
      .selectFrom('Common_Assessment_Outcome')
      .select([
        'egcs_cn_section as section',
        'egcs_cn_subsection as subsection',
        'egcs_cn_name_en as nameEn',
        'egcs_cn_name_fr as nameFr',
        'egcs_cn_recommendedstrategy as recommendedStrategy',
        'egcs_cn_selectedstrategy as selectedStrategy',
        'egcs_cn_accepted as accepted',
        'egcs_cn_justification as justification',
        'egcs_cn_comment as comment'
      ])
      .where('egcs_cn_review', '=', String(review.id))
      .where('Common_Assessment_Outcome._deleted', '=', false)
      .execute(),
    db
      .selectFrom('Common_Assessment_Custom_Outcome')
      .select([
        'id',
        'egcs_cn_name as name',
        'egcs_cn_outcome as outcome'
      ])
      .where('egcs_cn_review', '=', String(review.id))
      .where('Common_Assessment_Custom_Outcome._deleted', '=', false)
      .execute()
  ])

  return {
    answers: responses.filter(answer => answer.calculated !== true).map(answer => ({
      section: answer.section,
      subsection: answer.subsection,
      question: answer.question,
      value: answer.value === null || answer.value === undefined ? null : parseSafeDecimal(String(answer.value)),
      comment: answer.comment ?? ''
    })),
    outcomes: outcomes.map(outcome => ({
      section: outcome.section,
      subsection: outcome.subsection,
      nameEn: outcome.nameEn,
      nameFr: outcome.nameFr,
      recommendedStrategy: outcome.recommendedStrategy,
      selectedStrategy: outcome.selectedStrategy,
      accepted: Boolean(outcome.accepted),
      justification: outcome.justification ?? '',
      comment: outcome.comment ?? ''
    })),
    customOutcomes: customOutcomes.map(customOutcome => ({
      id: String(customOutcome.id),
      name: customOutcome.name ?? '',
      outcome: customOutcome.outcome ?? ''
    })),
    egcs_cn_reviewalignment: egcsCnReviewAlignment,
    egcs_cn_reviewalignresult: egcsCnReviewAlignResult,
    egcs_cn_reviewalignmentnarrative: egcsCnReviewAlignmentNarrative
  }
}

/**
 * Revalidates a prior response against the destination and rejects lossy copies.
 * @param event - Request for localized validation.
 * @param target - Destination review and captured runtime settings.
 * @param saved - Editable response from a submitted source.
 * @returns A draft response with destination calculations and no source row IDs.
 */
export const prepareAssessmentCopy = async (
  event: H3Event,
  target: AssessmentMutationReview,
  saved: AssessmentResponse
): Promise<AssessmentResponse> => {
  const input = {
    ...saved,
    customOutcomes: saved.customOutcomes.map(({ name, outcome }) => ({ name, outcome }))
  }
  const incompatible = (reason: 'alignment' | 'custom_outcomes' | 'strategies') =>
    badRequest(event, 'REVIEW_COPY_INCOMPATIBLE', `apiErrors.review_copy.${reason}`)
  if (target.egcs_cn_disablealignment && input.egcs_cn_reviewalignment) return await incompatible('alignment')
  if (target.egcs_cn_disablecustomoutcomes && input.customOutcomes.length) return await incompatible('custom_outcomes')

  const prepared = await prepareAssessmentPersistence(event, target, input, { enforceCompletion: false })
  const response = prepared.normalizedAssessmentResponse
  const losesOutcomeContent = input.outcomes.some(outcome =>
    (outcome.selectedStrategy || outcome.justification || outcome.comment) && !response.outcomes.some(current =>
      current.section === outcome.section
      && current.subsection === outcome.subsection
      && current.nameEn === outcome.nameEn
      && current.nameFr === outcome.nameFr
      && current.selectedStrategy === outcome.selectedStrategy
      && current.justification === outcome.justification
      && current.comment === outcome.comment
    ))
  if (losesOutcomeContent) return await incompatible('strategies')
  return response
}
