import { z } from 'zod'

export const RECOMMENDATION_QUESTION_TYPES = ['radio', 'text'] as const
export const RECOMMENDATION_OUTCOMES = ['recommended', 'not_recommended'] as const

const RequiredTextSchema = z.string().trim().min(1, { error: 'validation.required' })
const BilingualTextSchema = z.object({
  en: RequiredTextSchema,
  fr: RequiredTextSchema
})

export const RecommendationHelpSchema = z.object({
  key: RequiredTextSchema,
  title: BilingualTextSchema,
  description: BilingualTextSchema
})

export const RecommendationRadioOptionSchema = z.object({
  key: RequiredTextSchema,
  label: BilingualTextSchema,
  description: BilingualTextSchema.optional(),
  outcome: z.enum(RECOMMENDATION_OUTCOMES).optional()
})

const RecommendationQuestionBaseSchema = z.object({
  key: RequiredTextSchema,
  question: BilingualTextSchema,
  required: z.boolean(),
  isResult: z.boolean().default(false),
  help: z.array(RecommendationHelpSchema).optional()
})

export const RecommendationRadioQuestionSchema = RecommendationQuestionBaseSchema.extend({
  type: z.literal('radio'),
  options: z.array(RecommendationRadioOptionSchema).min(2, { error: 'validation.recommendation_options_required' })
    .superRefine((options, ctx) => {
      const keys = new Set<string>()
      options.forEach((option, index) => {
        if (keys.has(option.key)) {
          ctx.addIssue({ code: 'custom', message: 'validation.recommendation_duplicate_key', path: [index, 'key'] })
        }
        keys.add(option.key)
      })
    })
})

export const RecommendationTextQuestionSchema = RecommendationQuestionBaseSchema.extend({
  type: z.literal('text'),
  description: BilingualTextSchema.optional(),
  maxLength: z.number().int().min(1).max(10000)
})

export const RecommendationQuestionSchema = z.discriminatedUnion('type', [
  RecommendationRadioQuestionSchema,
  RecommendationTextQuestionSchema
])

export const RecommendationSubSectionSchema = z.object({
  key: RequiredTextSchema,
  label: BilingualTextSchema,
  questions: z.array(RecommendationQuestionSchema).min(1, { error: 'validation.recommendation_question_required' })
})

export const RecommendationSectionSchema = z.object({
  key: RequiredTextSchema,
  label: BilingualTextSchema,
  subSections: z.array(RecommendationSubSectionSchema).min(1, { error: 'validation.recommendation_subsection_required' })
})

const RecommendationDefinitionBaseSchema = z.object({
  sections: z.array(RecommendationSectionSchema).min(1, { error: 'validation.recommendation_section_required' })
})

export const RecommendationDefinitionSchema = RecommendationDefinitionBaseSchema.superRefine((definition, ctx) => {
  const sectionKeys = new Set<string>()
  const subSectionKeys = new Set<string>()
  const questionKeys = new Set<string>()
  const resultQuestions: Array<{ question: RecommendationQuestion, path: Array<string | number> }> = []
  definition.sections.forEach((section, sectionIndex) => {
    if (sectionKeys.has(section.key)) {
      ctx.addIssue({ code: 'custom', message: 'validation.recommendation_duplicate_key', path: ['sections', sectionIndex, 'key'] })
    }
    sectionKeys.add(section.key)
    section.subSections.forEach((subSection, subSectionIndex) => {
      if (subSectionKeys.has(subSection.key)) {
        ctx.addIssue({ code: 'custom', message: 'validation.recommendation_duplicate_key', path: ['sections', sectionIndex, 'subSections', subSectionIndex, 'key'] })
      }
      subSectionKeys.add(subSection.key)
      subSection.questions.forEach((question, questionIndex) => {
        if (questionKeys.has(question.key)) {
          ctx.addIssue({ code: 'custom', message: 'validation.recommendation_duplicate_key', path: ['sections', sectionIndex, 'subSections', subSectionIndex, 'questions', questionIndex, 'key'] })
        }
        questionKeys.add(question.key)
        if (question.isResult) {
          resultQuestions.push({
            question,
            path: ['sections', sectionIndex, 'subSections', subSectionIndex, 'questions', questionIndex]
          })
        }
      })
    })
  })

  if (resultQuestions.length !== 1) {
    ctx.addIssue({
      code: 'custom',
      message: 'validation.recommendation_exactly_one_result_question',
      path: ['sections']
    })
    return
  }

  const result = resultQuestions[0]!
  if (result.question.type !== 'radio') {
    ctx.addIssue({ code: 'custom', message: 'validation.recommendation_result_must_be_radio', path: [...result.path, 'type'] })
  }
  if (!result.question.required) {
    ctx.addIssue({ code: 'custom', message: 'validation.recommendation_result_must_be_required', path: [...result.path, 'required'] })
  }
  if (result.question.type === 'radio') {
    result.question.options.forEach((option, optionIndex) => {
      if (!option.outcome) {
        ctx.addIssue({
          code: 'custom', message: 'validation.recommendation_result_option_mapping_required',
          path: [...result.path, 'options', optionIndex, 'outcome']
        })
      }
    })
  }
})

export const RecommendationResponseSchema = z.object({
  questionKey: RequiredTextSchema,
  value: z.string()
})

export const RecommendationResponsesSchema = z.array(RecommendationResponseSchema).superRefine((responses, ctx) => {
  const seen = new Set<string>()
  responses.forEach((response, index) => {
    if (seen.has(response.questionKey)) {
      ctx.addIssue({ code: 'custom', message: 'validation.duplicate_response_key', path: [index, 'questionKey'] })
    }
    seen.add(response.questionKey)
  })
})

export const RecommendationResponseEnvelopeSchema = z.object({
  responses: RecommendationResponsesSchema.default([])
})

/**
 * Validates runtime responses against the pinned recommendation form definition.
 * @param definition Recommendation form definition.
 * @param responses User-entered responses.
 * @returns Response validation issues keyed to their questions.
 */
export const validateRecommendationResponses = (
  definition: RecommendationDefinition,
  responses: RecommendationResponse[]
) => {
  const responseByQuestion = new Map(responses.map(response => [response.questionKey, response.value]))
  const issues: Array<{ questionKey: string, message: string }> = []
  const knownQuestionKeys = new Set(definition.sections
    .flatMap(section => section.subSections)
    .flatMap(subSection => subSection.questions)
    .map(question => question.key))

  responses.forEach(response => {
    if (!knownQuestionKeys.has(response.questionKey)) {
      issues.push({ questionKey: response.questionKey, message: 'validation.recommendation_unknown_question' })
    }
  })

  definition.sections.forEach(section => section.subSections.forEach(subSection => {
    subSection.questions.forEach(question => {
      const value = responseByQuestion.get(question.key)
      if (question.required && (value === undefined || value.trim().length === 0)) {
        issues.push({ questionKey: question.key, message: 'validation.required' })
        return
      }
      if (value === undefined || value.length === 0) return
      if (question.type === 'radio' && !question.options.some(option => option.key === value)) {
        issues.push({ questionKey: question.key, message: 'validation.recommendation_invalid_option' })
      }
      if (question.type === 'text' && value.length > question.maxLength) {
        issues.push({ questionKey: question.key, message: 'validation.recommendation_max_length' })
      }
    })
  }))

  return issues
}

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
