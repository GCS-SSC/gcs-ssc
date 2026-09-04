/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- schema factory types document the validation contract */
import { z } from 'zod'
import type { AssessmentDefinition, ScoringMatrixItem } from './assessment'
import { AssessmentDefinitionSchema, ScoringMatrixItemSchema } from './assessment'
import {
  buildAssessmentRuntimeSummary
} from '../../../utils/assessment'
import { isRepresentableByNumeric } from '../../../utils/decimal'

const PersistedAssessmentNumericSchema = z.coerce.number({ error: 'validation.assessment_result_required' })
  .finite({ error: 'validation.invalid_number' })
  .refine(value => isRepresentableByNumeric(value, 10, 2), { error: 'validation.numeric_not_representable' })

const ReviewAlignResultSchema = PersistedAssessmentNumericSchema

const AssessmentResponseAnswerSchema = z.object({
  section: z.string({ error: 'validation.section_required' }).min(1, { error: 'validation.section_required' }),
  subsection: z.string({ error: 'validation.subsection_required' }).min(1, { error: 'validation.subsection_required' }),
  question: z.string({ error: 'validation.required' }).min(1, { error: 'validation.required' }),
  value: z.coerce.number({ error: 'validation.value_required' })
    .finite({ error: 'validation.invalid_number' })
    .refine(value => isRepresentableByNumeric(value, 10, 2), { error: 'validation.numeric_not_representable' })
    .nullable(),
  comment: z.string().default('')
})

const AssessmentResponseOutcomeSchema = z.object({
  section: z.string({ error: 'validation.section_required' }).min(1, { error: 'validation.section_required' }),
  subsection: z.string({ error: 'validation.subsection_required' }).min(1, { error: 'validation.subsection_required' }),
  nameEn: z.string({ error: 'validation.name_en_required' }).min(1, { error: 'validation.name_en_required' }),
  nameFr: z.string({ error: 'validation.name_fr_required' }).min(1, { error: 'validation.name_fr_required' }),
  recommendedStrategy: z.string().default(''),
  selectedStrategy: z.string().default(''),
  accepted: z.boolean().default(false),
  justification: z.string().default(''),
  comment: z.string().default('')
})

const AssessmentResponseCustomOutcomeSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string({ error: 'validation.name_required' }).trim().min(1, { error: 'validation.name_required' }),
  outcome: z.string({ error: 'validation.outcome_required' }).trim().min(1, { error: 'validation.outcome_required' })
})

export const AssessmentReviewAlignmentSchema = z.object({
  egcs_cn_reviewalignment: z.boolean().default(false),
  egcs_cn_reviewalignresult: ReviewAlignResultSchema.nullable().optional(),
  egcs_cn_reviewalignmentnarrative: z.string().default('')
})

export const AssessmentResponseSchema = z.object({
  answers: z.array(AssessmentResponseAnswerSchema).default([]),
  outcomes: z.array(AssessmentResponseOutcomeSchema).default([]),
  customOutcomes: z.array(AssessmentResponseCustomOutcomeSchema).default([])
}).merge(AssessmentReviewAlignmentSchema).superRefine((value, ctx) => {
  const uniqueCustomOutcomeNames = new Set<string>()

  value.customOutcomes.forEach((customOutcome, index) => {
    const customOutcomeName = customOutcome.name

    if (uniqueCustomOutcomeNames.has(customOutcomeName)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customOutcomes', index, 'name'],
        message: 'validation.duplicate_custom_outcome'
      })
      return
    }

    uniqueCustomOutcomeNames.add(customOutcomeName)
  })
})

const getCurrentOverallResultOption = (
  scoringMatrix: ScoringMatrixItem[],
  weightedScore: number
) => scoringMatrix.find(item => weightedScore <= item.max) ?? null

/**
 * Builds validation for the optional review alignment documentation fields.
 */
export const createAssessmentReviewAlignmentValidationSchema = (
  scoringMatrix: ScoringMatrixItem[],
  currentWeightedScore: number,
  disableAlignment: boolean
) => AssessmentReviewAlignmentSchema.superRefine((value, ctx) => {
  if (disableAlignment || value.egcs_cn_reviewalignment !== true) {
    return
  }

  if (!value.egcs_cn_reviewalignmentnarrative.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['egcs_cn_reviewalignmentnarrative'],
      message: 'validation.required'
    })
  }

  if (value.egcs_cn_reviewalignresult === null || value.egcs_cn_reviewalignresult === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['egcs_cn_reviewalignresult'],
      message: 'validation.assessment_result_required'
    })
    return
  }

  const currentResultOption = getCurrentOverallResultOption(scoringMatrix, currentWeightedScore)
  const allowedOptions = new Set(scoringMatrix.map(item => item.max))

  if (!allowedOptions.has(value.egcs_cn_reviewalignresult)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['egcs_cn_reviewalignresult'],
      message: 'validation.invalid_selection'
    })
  }

  if (currentResultOption && value.egcs_cn_reviewalignresult === currentResultOption.max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['egcs_cn_reviewalignresult'],
      message: 'validation.review_alignment_result_must_differ'
    })
  }
})

/**
 * Builds the full assessment response validator against the active schema, runtime rules,
 * and review alignment documentation requirements.
 */
export const createAssessmentResponseValidationSchema = (
  schema: AssessmentDefinition,
  scoringMatrix: ScoringMatrixItem[],
  helpers: Record<string, unknown> | null | undefined,
  options?: {
    enforceCompletion?: boolean
    disableCustomOutcomes?: boolean
    disableAlignment?: boolean
  }
) => AssessmentResponseSchema.superRefine((value, ctx) => {
  if (options?.disableCustomOutcomes && value.customOutcomes.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['customOutcomes'],
      message: 'validation.custom_outcomes_disabled'
    })
  }

  const runtimeSummary = buildAssessmentRuntimeSummary(value, {
    ...schema,
    scoringMatrix
  }, helpers)
  const issues = options?.enforceCompletion
    ? runtimeSummary.blockingIssues
    : runtimeSummary.blockingIssues.filter(issue =>
        issue.message === 'validation.duplicate_answer'
        || issue.message === 'validation.duplicate_outcome'
        || issue.message === 'validation.comments_required_question'
        || issue.message === 'validation.justification_required_outcome'
      )

  issues.forEach(issue => {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: issue.path,
      message: issue.message,
      params: issue.params
    })
  })

  createAssessmentReviewAlignmentValidationSchema(
    scoringMatrix,
    runtimeSummary.score.weightedScore,
    options?.disableAlignment === true
  ).safeParse(value).error?.issues.forEach(issue => {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: issue.path,
      message: issue.message
    })
  })
})

export const AssessmentResponseEnvelopeSchema = AssessmentResponseSchema.extend({
  schema: AssessmentDefinitionSchema,
  scoringMatrix: z.array(ScoringMatrixItemSchema),
  helpers: z.record(z.string(), z.unknown()).nullable().optional()
})

export type AssessmentResponse = z.infer<typeof AssessmentResponseSchema>
export type AssessmentResponseAnswer = z.infer<typeof AssessmentResponseAnswerSchema>
export type AssessmentResponseOutcome = z.infer<typeof AssessmentResponseOutcomeSchema>
export type AssessmentResponseCustomOutcome = z.infer<typeof AssessmentResponseCustomOutcomeSchema>
export type AssessmentReviewAlignment = z.infer<typeof AssessmentReviewAlignmentSchema>
