import { z } from 'zod'

export const QUESTIONNAIRE_QUESTION_TYPES = ['radio', 'text'] as const
export const QUESTIONNAIRE_COMMENT_POLICIES = ['none', 'optional', 'required'] as const

const RequiredTextSchema = z.string().trim().min(1, { error: 'validation.required' })
export const QuestionnaireBilingualTextSchema = z.strictObject({ en: RequiredTextSchema, fr: RequiredTextSchema }, { error: 'validation.invalid_selection' })

export const QuestionnaireHelpSchema = z.strictObject({
  key: RequiredTextSchema,
  title: QuestionnaireBilingualTextSchema,
  description: QuestionnaireBilingualTextSchema
}, { error: 'validation.invalid_selection' })

export const QuestionnaireRadioOptionSchema = z.strictObject({
  key: RequiredTextSchema,
  label: QuestionnaireBilingualTextSchema,
  description: QuestionnaireBilingualTextSchema.optional()
}, { error: 'validation.invalid_selection' })

export const QuestionnaireQuestionBaseSchema = z.strictObject({
  key: RequiredTextSchema,
  question: QuestionnaireBilingualTextSchema,
  required: z.boolean(),
  help: z.array(QuestionnaireHelpSchema).optional()
}, { error: 'validation.invalid_selection' })

/**
 * Enforces option-key uniqueness for both decision and decision-free questionnaires.
 * @param options Authored radio options.
 * @param ctx Validation issue collector.
 */
export const validateQuestionnaireOptionKeys = (options: Array<{ key: string }>, ctx: z.RefinementCtx) => {
  const keys = new Set<string>()
  options.forEach((option, index) => {
    if (keys.has(option.key)) {
      ctx.addIssue({ code: 'custom', message: 'validation.recommendation_duplicate_key', path: [index, 'key'] })
    }
    keys.add(option.key)
  })
}

export const QuestionnaireRadioQuestionSchema = QuestionnaireQuestionBaseSchema.extend({
  type: z.literal('radio'),
  commentPolicy: z.enum(QUESTIONNAIRE_COMMENT_POLICIES).default('none'),
  options: z.array(QuestionnaireRadioOptionSchema)
    .min(2, { error: 'validation.recommendation_options_required' }).superRefine(validateQuestionnaireOptionKeys)
})

export const QuestionnaireTextQuestionSchema = QuestionnaireQuestionBaseSchema.extend({
  type: z.literal('text'),
  description: QuestionnaireBilingualTextSchema.optional(),
  maxLength: z.number().int().min(1).max(10000)
})

export const QuestionnaireQuestionSchema = z.discriminatedUnion('type', [
  QuestionnaireRadioQuestionSchema, QuestionnaireTextQuestionSchema
])
export const QuestionnaireSubSectionSchema = z.strictObject({
  key: RequiredTextSchema,
  label: QuestionnaireBilingualTextSchema,
  questions: z.array(QuestionnaireQuestionSchema).min(1, { error: 'validation.recommendation_question_required' })
}, { error: 'validation.invalid_selection' })
export const QuestionnaireSectionSchema = z.strictObject({
  key: RequiredTextSchema,
  label: QuestionnaireBilingualTextSchema,
  subSections: z.array(QuestionnaireSubSectionSchema).min(1, { error: 'validation.recommendation_subsection_required' })
}, { error: 'validation.invalid_selection' })
export const QuestionnaireDefinitionBaseSchema = z.strictObject({
  sections: z.array(QuestionnaireSectionSchema).min(1, { error: 'validation.recommendation_section_required' })
}, { error: 'validation.invalid_selection' })

/**
 * Structural keys have separate namespaces; question keys are unique across the complete form.
 * @param definition Authored questionnaire definition.
 * @param ctx Validation issue collector.
 */
export const validateQuestionnaireDefinitionKeys = (definition: QuestionnaireDefinition, ctx: z.RefinementCtx) => {
  const sectionKeys = new Set<string>()
  const subSectionKeys = new Set<string>()
  const questionKeys = new Set<string>()
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
      })
    })
  })
}

export const QuestionnaireDefinitionSchema = QuestionnaireDefinitionBaseSchema.superRefine(validateQuestionnaireDefinitionKeys)
export const QuestionnaireResponseSchema = z.strictObject({
  questionKey: RequiredTextSchema,
  value: z.string(),
  comment: z.string().optional()
}, { error: 'validation.invalid_selection' })
/**
 * Rejects ambiguous duplicate response keys.
 * @param responses Submitted response document.
 * @param ctx Validation issue collector.
 */
export const validateQuestionnaireResponseKeys = (responses: QuestionnaireResponse[], ctx: z.RefinementCtx) => {
  const seen = new Set<string>()
  responses.forEach((response, index) => {
    if (seen.has(response.questionKey)) {
      ctx.addIssue({ code: 'custom', message: 'validation.duplicate_response_key', path: [index, 'questionKey'] })
    }
    seen.add(response.questionKey)
  })
}
export const QuestionnaireResponsesSchema = z.array(QuestionnaireResponseSchema).superRefine(validateQuestionnaireResponseKeys)
export const QuestionnaireResponseEnvelopeSchema = z.strictObject({
  responses: QuestionnaireResponsesSchema.default([])
}, { error: 'validation.invalid_selection' })

/**
 * Drafts retain incomplete answers; every supplied nonempty answer still belongs to the pinned form.
 * @param definition Immutable questionnaire definition.
 * @param responses Current response draft.
 * @param root0 Validation coordination options.
 * @param root0.mode Draft or final submission requirements.
 * @returns Validation issues keyed to their interactive questions.
 */
export const validateQuestionnaireResponses = (
  definition: QuestionnaireDefinition,
  responses: QuestionnaireResponse[],
  { mode = 'submit' }: { mode?: 'draft' | 'submit' } = {}
) => {
  const responseByQuestion = new Map(responses.map(response => [response.questionKey, response]))
  const issues: Array<{ questionKey: string, message: string, field?: 'comment' }> = []
  const questions = definition.sections.flatMap(section => section.subSections).flatMap(subSection => subSection.questions)
  const knownQuestionKeys = new Set(questions.map(question => question.key))
  responses.forEach(response => {
    if (!knownQuestionKeys.has(response.questionKey)) {
      issues.push({ questionKey: response.questionKey, message: 'validation.recommendation_unknown_question' })
    }
  })
  questions.forEach(question => {
    const response = responseByQuestion.get(question.key)
    const value = response?.value
    if (mode === 'submit' && question.required && (value === undefined || value.trim().length === 0)) {
      issues.push({ questionKey: question.key, message: 'validation.required' })
      return
    }
    if (value === undefined || value.length === 0) return
    if (question.type === 'radio') {
      if (!question.options.some(option => option.key === value)) {
        issues.push({ questionKey: question.key, message: 'validation.recommendation_invalid_option' })
      } else if (mode === 'submit' && question.commentPolicy === 'required' && !response?.comment?.trim()) {
        issues.push({ questionKey: question.key, message: 'validation.comment_required', field: 'comment' })
      }
    }
    if (question.type === 'text' && value.length > question.maxLength) {
      issues.push({ questionKey: question.key, message: 'validation.recommendation_max_length' })
    }
  })
  return issues
}

/**
 * Provides a stable initial form; authoring controls localize its blank bilingual content.
 * @returns Incomplete authoring form with stable structural keys.
 */
export const createDefaultQuestionnaireDefinition = (): QuestionnaireDefinition => ({
  sections: [{ key: 'section-1', label: { en: '', fr: '' }, subSections: [{
    key: 'subsection-1', label: { en: '', fr: '' }, questions: [{
      key: 'question-1', type: 'text', question: { en: '', fr: '' }, required: true, maxLength: 1000
    }]
  }] }]
})

export type QuestionnaireDefinition = z.infer<typeof QuestionnaireDefinitionBaseSchema>
export type QuestionnaireQuestion = z.infer<typeof QuestionnaireQuestionSchema>
export type QuestionnaireResponse = z.infer<typeof QuestionnaireResponseSchema>
export type QuestionnaireResponses = QuestionnaireResponse[]
