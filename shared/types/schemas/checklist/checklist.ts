/* eslint-disable jsdoc/require-jsdoc -- exported Zod declarations are self-describing */
import { z } from 'zod'
import { HelpSchema } from '../help'

export const CHECKLIST_ANSWERS = ['pass', 'fail'] as const
export const CHECKLIST_RESULTS = ['pass', 'pass_with_considerations', 'fail'] as const
export const CHECKLIST_COMMENT_POLICIES = ['optional', 'required', 'required_on_fail'] as const
export const CHECKLIST_RESULT_GROUP_MODES = ['any', 'all', 'at_least_count', 'at_least_rate'] as const

const RequiredTextSchema = z.string().trim().min(1, { error: 'validation.required' })
const BilingualTextSchema = z.object({
  en: RequiredTextSchema,
  fr: RequiredTextSchema
})

export const DEFAULT_CHECKLIST_OPTIONS = [
  {
    value: 'pass' as const,
    description: {
      en: 'The requirement is satisfied based on the available evidence.',
      fr: 'L’exigence est satisfaite selon les éléments de preuve disponibles.'
    }
  },
  {
    value: 'fail' as const,
    description: {
      en: 'The requirement is not satisfied or the available evidence is insufficient.',
      fr: 'L’exigence n’est pas satisfaite ou les éléments de preuve disponibles sont insuffisants.'
    }
  }
] as const

const ChecklistOptionSchema = z.object({
  value: z.enum(CHECKLIST_ANSWERS),
  description: BilingualTextSchema
})

const ChecklistOptionsSchema = z.array(ChecklistOptionSchema)
  .length(CHECKLIST_ANSWERS.length)
  .default(DEFAULT_CHECKLIST_OPTIONS.map(option => ({
    value: option.value,
    description: { ...option.description }
  })))
  .superRefine((options, ctx) => {
    CHECKLIST_ANSWERS.forEach(answer => {
      if (!options.some(option => option.value === answer)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'validation.checklist_answer_option_required',
          path: []
        })
      }
    })
  })

export const ChecklistQuestionSchema = z.object({
  key: RequiredTextSchema,
  question: BilingualTextSchema,
  help: z.array(HelpSchema).default([]),
  options: ChecklistOptionsSchema,
  required: z.boolean(),
  commentPolicy: z.enum(CHECKLIST_COMMENT_POLICIES)
})

export const ChecklistSubSectionSchema = z.object({
  key: RequiredTextSchema,
  label: BilingualTextSchema,
  questions: z.array(ChecklistQuestionSchema).min(1, { error: 'validation.checklist_question_required' })
})

export const ChecklistSectionSchema = z.object({
  key: RequiredTextSchema,
  label: BilingualTextSchema,
  questions: z.array(ChecklistQuestionSchema).default([]),
  subSections: z.array(ChecklistSubSectionSchema).default([])
}).refine(section => section.questions.length > 0 || section.subSections.length > 0, {
  error: 'validation.checklist_question_required'
})

export type ChecklistQuestionFailureCondition = {
  kind: 'question_failed'
  questionKey: string
}

export type ChecklistResultGroup = {
  kind: 'group'
  key: string
  label: { en: string, fr: string }
  mode: typeof CHECKLIST_RESULT_GROUP_MODES[number]
  threshold?: number
  result: typeof CHECKLIST_RESULTS[number]
  items: ChecklistResultPolicyItem[]
}

export type ChecklistResultPolicyItem = ChecklistQuestionFailureCondition | ChecklistResultGroup

export const ChecklistQuestionFailureConditionSchema = z.object({
  kind: z.literal('question_failed'),
  questionKey: RequiredTextSchema
})

export const ChecklistResultGroupSchema: z.ZodType<ChecklistResultGroup> = z.lazy(() => z.object({
  kind: z.literal('group'),
  key: RequiredTextSchema,
  label: BilingualTextSchema,
  mode: z.enum(CHECKLIST_RESULT_GROUP_MODES),
  threshold: z.number().nonnegative().optional(),
  result: z.enum(CHECKLIST_RESULTS),
  items: z.array(z.union([
    ChecklistQuestionFailureConditionSchema,
    ChecklistResultGroupSchema
  ])).min(1, { error: 'validation.checklist_condition_required' })
}))

export const ChecklistResultPolicySchema = z.object({
  anyFailureFails: z.boolean().default(true),
  groups: z.array(ChecklistResultGroupSchema).default([])
})

const ChecklistDefinitionBaseSchema = z.object({
  sections: z.array(ChecklistSectionSchema).min(1, { error: 'validation.checklist_section_required' }),
  resultPolicy: ChecklistResultPolicySchema.default({ anyFailureFails: true, groups: [] })
})

const addDuplicateIssue = (ctx: z.RefinementCtx, path: Array<string | number>) => {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'validation.checklist_duplicate_key',
    path
  })
}

const validateResultGroup = (
  group: ChecklistResultGroup,
  questionKeys: Set<string>,
  groupKeys: Set<string>,
  ctx: z.RefinementCtx,
  path: Array<string | number>,
  depth: number
) => {
  if (groupKeys.has(group.key)) {
    addDuplicateIssue(ctx, [...path, 'key'])
  }
  groupKeys.add(group.key)

  if (depth > 3) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'validation.checklist_max_group_depth', path })
  }

  if (group.mode === 'at_least_count') {
    if (group.threshold === undefined || group.threshold < 1 || !Number.isInteger(group.threshold) || group.threshold > group.items.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'validation.checklist_invalid_count', path: [...path, 'threshold'] })
    }
  } else if (group.mode === 'at_least_rate') {
    if (group.threshold === undefined || group.threshold <= 0 || group.threshold > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'validation.checklist_invalid_rate', path: [...path, 'threshold'] })
    }
  }

  const directQuestionKeys = new Set<string>()
  group.items.forEach((item, itemIndex) => {
    const itemPath = [...path, 'items', itemIndex]
    if (item.kind === 'question_failed') {
      if (!questionKeys.has(item.questionKey)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'validation.checklist_unknown_question', path: [...itemPath, 'questionKey'] })
      }
      if (directQuestionKeys.has(item.questionKey)) {
        addDuplicateIssue(ctx, [...itemPath, 'questionKey'])
      }
      directQuestionKeys.add(item.questionKey)
      return
    }

    validateResultGroup(item, questionKeys, groupKeys, ctx, itemPath, depth + 1)
  })
}

export const ChecklistDefinitionSchema = ChecklistDefinitionBaseSchema.superRefine((definition, ctx) => {
  const sectionKeys = new Set<string>()
  const subSectionKeys = new Set<string>()
  const questionKeys = new Set<string>()
  const groupKeys = new Set<string>()

  definition.sections.forEach((section, sectionIndex) => {
    if (sectionKeys.has(section.key)) {
      addDuplicateIssue(ctx, ['sections', sectionIndex, 'key'])
    }
    sectionKeys.add(section.key)
    section.subSections.forEach((subSection, subSectionIndex) => {
      if (subSectionKeys.has(subSection.key)) {
        addDuplicateIssue(ctx, ['sections', sectionIndex, 'subSections', subSectionIndex, 'key'])
      }
      subSectionKeys.add(subSection.key)
    })

    section.questions.forEach((question, questionIndex) => {
      if (questionKeys.has(question.key)) {
        addDuplicateIssue(ctx, ['sections', sectionIndex, 'questions', questionIndex, 'key'])
      }
      questionKeys.add(question.key)
    })
    section.subSections.forEach((subSection, subSectionIndex) => {
      subSection.questions.forEach((question, questionIndex) => {
        if (questionKeys.has(question.key)) {
          addDuplicateIssue(ctx, ['sections', sectionIndex, 'subSections', subSectionIndex, 'questions', questionIndex, 'key'])
        }
        questionKeys.add(question.key)
      })
    })
  })

  definition.resultPolicy.groups.forEach((group, groupIndex) => {
    validateResultGroup(group, questionKeys, groupKeys, ctx, ['resultPolicy', 'groups', groupIndex], 1)
  })
})

export const ChecklistResponseSchema = z.object({
  questionKey: RequiredTextSchema,
  answer: z.enum(CHECKLIST_ANSWERS),
  comment: z.string().trim().optional()
})

const ChecklistResponsesBaseSchema = z.array(ChecklistResponseSchema)

export const ChecklistResponsesSchema = ChecklistResponsesBaseSchema.superRefine((responses, ctx) => {
  const questionKeys = new Set<string>()
  responses.forEach((response, index) => {
    if (questionKeys.has(response.questionKey)) {
      addDuplicateIssue(ctx, [index, 'questionKey'])
    }
    questionKeys.add(response.questionKey)
  })
})

export const ChecklistResponseEnvelopeSchema = z.object({
  responses: ChecklistResponsesSchema.default([])
})

export type ChecklistAnswer = typeof CHECKLIST_ANSWERS[number]
export type ChecklistResult = typeof CHECKLIST_RESULTS[number]
export type ChecklistCommentPolicy = typeof CHECKLIST_COMMENT_POLICIES[number]
export type ChecklistResultGroupMode = typeof CHECKLIST_RESULT_GROUP_MODES[number]
export type ChecklistOption = z.infer<typeof ChecklistOptionSchema>
export type ChecklistQuestion = z.infer<typeof ChecklistQuestionSchema>
export type ChecklistSubSection = z.infer<typeof ChecklistSubSectionSchema>
export type ChecklistSection = z.infer<typeof ChecklistSectionSchema>
export type ChecklistResultPolicy = z.infer<typeof ChecklistResultPolicySchema>
export type ChecklistDefinition = z.infer<typeof ChecklistDefinitionSchema>
export type ChecklistResponse = z.infer<typeof ChecklistResponseSchema>
export type ChecklistResponseEnvelope = z.infer<typeof ChecklistResponseEnvelopeSchema>
