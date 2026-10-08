import { z } from 'zod'
import {
  QUESTIONNAIRE_QUESTION_TYPES,
  QUESTIONNAIRE_COMMENT_POLICIES,
  QuestionnaireBilingualTextSchema,
  QuestionnaireHelpSchema,
  QuestionnaireRadioOptionSchema,
  QuestionnaireRadioQuestionSchema,
  QuestionnaireTextQuestionSchema,
  QuestionnaireSubSectionSchema,
  QuestionnaireSectionSchema,
  QuestionnaireDefinitionBaseSchema,
  QuestionnaireResponseSchema,
  validateQuestionnaireDefinitionKeys,
  validateQuestionnaireOptionKeys,
  validateQuestionnaireResponseKeys,
  validateQuestionnaireResponses
} from '../questionnaire'

export const RECOMMENDATION_QUESTION_TYPES = QUESTIONNAIRE_QUESTION_TYPES
export const RECOMMENDATION_OUTCOMES = ['recommended', 'not_recommended'] as const
export const RECOMMENDATION_COMMENT_POLICIES = QUESTIONNAIRE_COMMENT_POLICIES
const RecommendationBilingualTextSchema = QuestionnaireBilingualTextSchema.strip()
export const RecommendationHelpSchema = QuestionnaireHelpSchema.extend({
  title: RecommendationBilingualTextSchema,
  description: RecommendationBilingualTextSchema
}).strip()
const RecommendationQuestionPresentation = {
  question: RecommendationBilingualTextSchema,
  help: z.array(RecommendationHelpSchema).optional()
}
export const RecommendationRadioOptionSchema = QuestionnaireRadioOptionSchema.extend({
  label: RecommendationBilingualTextSchema,
  description: RecommendationBilingualTextSchema.optional(),
  outcome: z.enum(RECOMMENDATION_OUTCOMES).optional()
}).strip()
export const RecommendationRadioQuestionSchema = QuestionnaireRadioQuestionSchema.extend({
  ...RecommendationQuestionPresentation,
  isResult: z.boolean().default(false),
  options: z.array(RecommendationRadioOptionSchema).min(2, { error: 'validation.recommendation_options_required' })
    .superRefine(validateQuestionnaireOptionKeys)
}).strip()
export const RecommendationTextQuestionSchema = QuestionnaireTextQuestionSchema.extend({
  ...RecommendationQuestionPresentation,
  isResult: z.boolean().default(false),
  description: RecommendationBilingualTextSchema.optional()
}).strip()
export const RecommendationQuestionSchema = z.discriminatedUnion('type', [
  RecommendationRadioQuestionSchema, RecommendationTextQuestionSchema
])
export const RecommendationSubSectionSchema = QuestionnaireSubSectionSchema.extend({
  label: RecommendationBilingualTextSchema,
  questions: z.array(RecommendationQuestionSchema).min(1, { error: 'validation.recommendation_question_required' })
}).strip()
export const RecommendationSectionSchema = QuestionnaireSectionSchema.extend({
  label: RecommendationBilingualTextSchema,
  subSections: z.array(RecommendationSubSectionSchema).min(1, { error: 'validation.recommendation_subsection_required' })
}).strip()
const RecommendationDefinitionBaseSchema = QuestionnaireDefinitionBaseSchema.extend({
  sections: z.array(RecommendationSectionSchema).min(1, { error: 'validation.recommendation_section_required' })
}).strip()

export const RecommendationDefinitionSchema = RecommendationDefinitionBaseSchema.superRefine((definition, ctx) => {
  validateQuestionnaireDefinitionKeys(definition, ctx)
  const resultQuestions: Array<{ question: RecommendationQuestion, path: Array<string | number> }> = []
  definition.sections.forEach((section, sectionIndex) => section.subSections.forEach((subSection, subSectionIndex) => {
    subSection.questions.forEach((question, questionIndex) => {
      if (question.isResult) resultQuestions.push({
        question, path: ['sections', sectionIndex, 'subSections', subSectionIndex, 'questions', questionIndex]
      })
    })
  }))
  if (resultQuestions.length !== 1) {
    ctx.addIssue({ code: 'custom', message: 'validation.recommendation_exactly_one_result_question', path: ['sections'] })
    return
  }
  const result = resultQuestions[0]!
  if (result.question.type !== 'radio') {
    ctx.addIssue({ code: 'custom', message: 'validation.recommendation_result_must_be_radio', path: [...result.path, 'type'] })
  }
  if (!result.question.required) {
    ctx.addIssue({ code: 'custom', message: 'validation.recommendation_result_must_be_required', path: [...result.path, 'required'] })
  }
  if (result.question.type === 'radio') result.question.options.forEach((option, optionIndex) => {
    if (!option.outcome) ctx.addIssue({
      code: 'custom', message: 'validation.recommendation_result_option_mapping_required',
      path: [...result.path, 'options', optionIndex, 'outcome']
    })
  })
})

export const RecommendationResponseSchema = QuestionnaireResponseSchema.strip()
export const RecommendationResponsesSchema = z.array(RecommendationResponseSchema).superRefine(validateQuestionnaireResponseKeys)
export const RecommendationResponseEnvelopeSchema = z.object({ responses: RecommendationResponsesSchema.default([]) })
export const validateRecommendationResponses = validateQuestionnaireResponses

/**
 * Derives the canonical outcome and selected option from a pinned schema definition.
 * @param definition Pinned recommendation definition.
 * @param responses Runtime responses to the pinned definition.
 * @returns Selected option and canonical outcome, or null when no valid result is selected.
 */
export const deriveRecommendationOutcome = (
  definition: RecommendationDefinition,
  responses: RecommendationResponse[]
): { optionKey: string, outcome: RecommendationOutcome } | null => {
  const resultQuestion = definition.sections
    .flatMap(section => section.subSections)
    .flatMap(subSection => subSection.questions)
    .find(question => question.isResult)

  if (!resultQuestion || resultQuestion.type !== 'radio') return null
  const selectedValue = responses.find(response => response.questionKey === resultQuestion.key)?.value
  if (!selectedValue) return null
  const option = resultQuestion.options.find(candidate => candidate.key === selectedValue)
  if (!option) return null
  if (!option.outcome) return null
  return { optionKey: option.key, outcome: option.outcome }
}

export type RecommendationDefinition = z.infer<typeof RecommendationDefinitionSchema>
export type RecommendationQuestion = z.infer<typeof RecommendationQuestionSchema>
export type RecommendationResponse = z.infer<typeof RecommendationResponseSchema>
export type RecommendationOutcome = typeof RECOMMENDATION_OUTCOMES[number]
