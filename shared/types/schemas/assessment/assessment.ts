/* eslint-disable jsdoc/require-jsdoc -- schema declarations and local validators are self-describing */
import { z } from 'zod'
import { EnFrLabelSchema } from '../common'
import { HelpSchema } from '../help'
import { AssessmentCalculationFormulaSchema } from './calculation'
import type { AssessmentCalculationExpression } from './calculation'
import {
  buildAssessmentCalculationKey,
  collectDependencyAnswerKeys,
  collectCalculationHelperFields,
  validateAssessmentCalculationGraph
} from '../../../utils/assessment-calculation'
import {
  getAssessmentHelperComparableValueType,
  getAssessmentHelperDefinition
} from '../../../utils/assessment-helpers'
import type { Entity_Type } from '../../database'

export const assistance = ['fundingHistory'] as const

const HelpersDependencySchema = z.object({
  type: z.literal('helpers'),
  field: z.string().trim().min(1, 'validation.required')
})

const AnswerDependencySchema = z.object({
  type: z.literal('answers'),
  section: z.string().trim().min(1, 'validation.required'),
  subsection: z.string().trim().min(1, 'validation.required'),
  question: z.string().trim().min(1, 'validation.required')
})

const DependencyOnSchema = z.discriminatedUnion('type', [HelpersDependencySchema, AnswerDependencySchema])

const DependencyValueSchema = z.boolean().or(z.coerce.number().or(z.string()))
const RequiredEnFrLabelSchema = EnFrLabelSchema.extend({
  en: z.string().trim().min(1, 'validation.required'),
  fr: z.string().trim().min(1, 'validation.required')
})

export const ScoringMatrixItemSchema = z.object({
  max: z.coerce.number(),
  label: EnFrLabelSchema,
  indicator: z.string().regex(/^#(?:[0-9A-Fa-f]{3}){1,2}$/, 'validation.invalid_hex_color')
})

const validateStrictlyIncreasingMaxima = (
  rows: Array<{ max: number }>,
  ctx: z.RefinementCtx,
  path: Array<string | number>
) => {
  rows.forEach((row, index) => {
    if (index > 0 && row.max <= (rows[index - 1]?.max ?? Number.NEGATIVE_INFINITY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validation.scoring_matrix_order',
        path: [...path, index, 'max']
      })
    }
  })
}

export const AssessmentScoringMatrixSchema = z.array(ScoringMatrixItemSchema).superRefine((rows, ctx) => {
  validateStrictlyIncreasingMaxima(rows, ctx, [])
})

const OutcomeOptionSchema = z.object({
  max: z.coerce.number(),
  value: z.string(),
  label: EnFrLabelSchema
})

export const OutcomeSchema = z.object({
  label: RequiredEnFrLabelSchema,
  name: z.string().trim().min(1, 'validation.required'),
  strategies: z.array(
    z.object({
      name: z.string().trim().min(1, 'validation.required'),
      label: RequiredEnFrLabelSchema,
      options: z.array(OutcomeOptionSchema)
    })
  )
})

const AdjustableWeightSchema = z.object({
  adjustable: z.literal(true),
  on: DependencyOnSchema,
  weights: z.record(z.string(), z.coerce.number())
})

/** Stores an initial weight multiplied by each matching dependency-controlled factor. */
const AdjustableWeightArraySchema = z.tuple([z.coerce.number(), z.array(AdjustableWeightSchema)])

const FixedWeightSchema = z.object({
  adjustable: z.literal(false),
  weight: z.coerce.number()
})

const MinMaxSchema = z.object({
  min: z.coerce.number(),
  max: z.coerce.number()
})

const OptionSchema = z.object({
  value: z.coerce.number(),
  label: EnFrLabelSchema,
  description: EnFrLabelSchema
})

const DependencySchemaBase = z.object({
  on: DependencyOnSchema,
  value: DependencyValueSchema
})

const DependencySchema = DependencySchemaBase.or(z.array(DependencySchemaBase))

export const QuestionSchema = z.object({
  type: z.literal('question'),
  name: z.string().trim().min(1, 'validation.required'),
  question: RequiredEnFrLabelSchema,
  weight: AdjustableWeightSchema.or(FixedWeightSchema),
  commentThreshold: MinMaxSchema,
  options: z.array(OptionSchema),
  help: z.array(HelpSchema),
  depends: z.optional(z.array(DependencySchema)),
  assistance: z.optional(z.enum(assistance))
})

export const CalculationSchema = z.object({
  type: z.literal('calculation'),
  name: z.string().trim().min(1, 'validation.required'),
  question: RequiredEnFrLabelSchema,
  weight: AdjustableWeightSchema.or(FixedWeightSchema),
  help: z.array(HelpSchema),
  depends: z.optional(z.array(DependencySchema)),
  formula: AssessmentCalculationFormulaSchema
})

export const AssessmentQuestionItemSchema = z.discriminatedUnion('type', [QuestionSchema, CalculationSchema])

const SubSectionSchema = z.object({
  name: z.string(),
  weight: AdjustableWeightSchema.or(FixedWeightSchema).or(AdjustableWeightArraySchema),
  label: EnFrLabelSchema,
  // "questions" is retained for compatibility, but entries may be direct prompts or calculated values.
  questions: z.array(AssessmentQuestionItemSchema),
  depends: z.optional(z.array(DependencySchema))
})

const SectionSchema = z.object({
  weight: z.coerce.number(),
  number: z.string(),
  label: EnFrLabelSchema,
  name: z.string(),
  icon: z.string(),
  subSections: z.array(SubSectionSchema)
})

export const ImpactorsSchema = z.object({
  weight: z.coerce.number(),
  on: DependencyOnSchema,
  scoringMatrix: z.array(
    z.object({
      max: z.coerce.number(),
      value: z.coerce.number()
    })
  ),
  label: z.optional(EnFrLabelSchema)
})

const HelpersSchema = z.record(z.string(), DependencyValueSchema)

const AssessmentDefinitionSchema = z.object({
  helpers: z.optional(HelpersSchema),
  sections: z.array(SectionSchema),
  sectionMatrix: z.array(ScoringMatrixItemSchema),
  outcomes: z.array(OutcomeSchema),
  impactors: z.optional(z.array(ImpactorsSchema))
}).superRefine((value, ctx) => {
  validateStrictlyIncreasingMaxima(value.sectionMatrix, ctx, ['sectionMatrix'])
  value.outcomes.forEach((outcome, outcomeIndex) => {
    outcome.strategies.forEach((strategy, strategyIndex) => {
      validateStrictlyIncreasingMaxima(strategy.options, ctx, ['outcomes', outcomeIndex, 'strategies', strategyIndex, 'options'])
    })
  })
  value.impactors?.forEach((impactor, impactorIndex) => {
    validateStrictlyIncreasingMaxima(impactor.scoringMatrix, ctx, ['impactors', impactorIndex, 'scoringMatrix'])
  })
})

const AssessmentSchema = z.object({
  assessmentSchemaId: z.coerce.number()
})

const validateHelperField = (
  entityType: Entity_Type,
  field: string,
  ctx: z.RefinementCtx,
  path: Array<string | number>
) => {
  const helperDefinition = getAssessmentHelperDefinition(entityType, field)

  if (!helperDefinition) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'validation.invalid_helper_field',
      path
    })
    return null
  }

  return helperDefinition
}

const validateHelperValueType = (
  entityType: Entity_Type,
  field: string,
  value: unknown,
  ctx: z.RefinementCtx,
  path: Array<string | number>
) => {
  const helperDefinition = validateHelperField(entityType, field, ctx, path)
  if (!helperDefinition) {
    return
  }

  const comparableValueType = getAssessmentHelperComparableValueType(helperDefinition)
  const actualValueType = typeof value

  if (actualValueType !== comparableValueType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'validation.invalid_helper_value_type',
      path
    })
  }
}

const validateDependencyRule = (
  entityType: Entity_Type,
  dependency: unknown,
  ctx: z.RefinementCtx,
  path: Array<string | number>
) => {
  if (Array.isArray(dependency)) {
    dependency.forEach((item, index) => {
      validateDependencyRule(entityType, item, ctx, [...path, index])
    })
    return
  }

  if (typeof dependency !== 'object' || dependency === null) {
    return
  }

  const dependencyRecord = dependency as {
    on?: { type?: string, field?: string }
    value?: unknown
  }

  if (dependencyRecord.on?.type !== 'helpers' || typeof dependencyRecord.on.field !== 'string') {
    return
  }

  validateHelperValueType(entityType, dependencyRecord.on.field, dependencyRecord.value, ctx, [...path, 'value'])
}

const validateAdjustableWeightTarget = (
  entityType: Entity_Type,
  weight: unknown,
  ctx: z.RefinementCtx,
  path: Array<string | number>
) => {
  if (Array.isArray(weight)) {
    const scenarios = weight[1]
    if (!Array.isArray(scenarios)) {
      return
    }

    scenarios.forEach((scenario, scenarioIndex) => {
      validateAdjustableWeightTarget(entityType, scenario, ctx, [...path, 1, scenarioIndex])
    })
    return
  }

  if (typeof weight !== 'object' || weight === null) {
    return
  }

  const weightRecord = weight as {
    adjustable?: unknown
    on?: { type?: string, field?: string }
  }

  if (weightRecord.adjustable !== true || weightRecord.on?.type !== 'helpers' || typeof weightRecord.on.field !== 'string') {
    return
  }

  validateHelperField(entityType, weightRecord.on.field, ctx, [...path, 'on', 'field'])
}

export const createAssessmentDefinitionSchemaForEntityType = (entityType: Entity_Type) => AssessmentDefinitionSchema.superRefine((value, ctx) => {
  const allItemKeys = new Set<string>()
  const sectionNames = new Set<string>()
  const calculationItems: Array<{
    key: string
    section: string
    subsection: string
    question: string
    path: Array<string | number>
    expression: AssessmentCalculationExpression
    dependencyKeys: string[]
  }> = []

  Object.entries(value.helpers ?? {}).forEach(([field, helperValue]) => {
    validateHelperValueType(entityType, field, helperValue, ctx, ['helpers', field])
  })

  value.sections.forEach((section, sectionIndex) => {
    if (sectionNames.has(section.name)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'validation.duplicate_semantic_key', path: ['sections', sectionIndex, 'name'] })
    }
    sectionNames.add(section.name)
    const subsectionNames = new Set<string>()
    section.subSections.forEach((subSection, subSectionIndex) => {
      if (subsectionNames.has(subSection.name)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'validation.duplicate_semantic_key', path: ['sections', sectionIndex, 'subSections', subSectionIndex, 'name'] })
      }
      subsectionNames.add(subSection.name)
      const questionNames = new Set<string>()
      const subsectionDependencyKeys = collectDependencyAnswerKeys(subSection.depends)
      validateAdjustableWeightTarget(entityType, subSection.weight, ctx, ['sections', sectionIndex, 'subSections', subSectionIndex, 'weight'])

      subSection.depends?.forEach((dependency, dependencyIndex) => {
        validateDependencyRule(entityType, dependency, ctx, ['sections', sectionIndex, 'subSections', subSectionIndex, 'depends', dependencyIndex])
      })

      subSection.questions.forEach((question, questionIndex) => {
        const itemKey = buildAssessmentCalculationKey(section.name, subSection.name, question.name)
        if (questionNames.has(question.name) || allItemKeys.has(itemKey)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'validation.duplicate_semantic_key', path: ['sections', sectionIndex, 'subSections', subSectionIndex, 'questions', questionIndex, 'name'] })
        }
        questionNames.add(question.name)
        allItemKeys.add(itemKey)
        validateAdjustableWeightTarget(entityType, question.weight, ctx, ['sections', sectionIndex, 'subSections', subSectionIndex, 'questions', questionIndex, 'weight'])

        question.depends?.forEach((dependency, dependencyIndex) => {
          validateDependencyRule(entityType, dependency, ctx, ['sections', sectionIndex, 'subSections', subSectionIndex, 'questions', questionIndex, 'depends', dependencyIndex])
        })

        if (question.type !== 'calculation') {
          return
        }

        collectCalculationHelperFields(question.formula).forEach(field => {
          validateHelperField(
            entityType,
            field,
            ctx,
            ['sections', sectionIndex, 'subSections', subSectionIndex, 'questions', questionIndex, 'formula']
          )
        })

        calculationItems.push({
          key: itemKey,
          section: section.name,
          subsection: subSection.name,
          question: question.name,
          path: ['sections', sectionIndex, 'subSections', subSectionIndex, 'questions', questionIndex, 'formula'],
          expression: question.formula,
          dependencyKeys: [
            ...subsectionDependencyKeys,
            ...collectDependencyAnswerKeys(question.depends)
          ]
        })
      })
    })
  })

  value.impactors?.forEach((impactor, impactorIndex) => {
    if (impactor.on.type !== 'helpers') {
      return
    }

    validateHelperField(entityType, impactor.on.field, ctx, ['impactors', impactorIndex, 'on', 'field'])
  })
  const itemPathByKey = new Map(calculationItems.map(item => [item.key, item.path]))
  const calculationGraphValidation = validateAssessmentCalculationGraph(
    calculationItems.map(item => ({
      key: item.key,
      section: item.section,
      subsection: item.subsection,
      question: item.question,
      expression: item.expression,
      dependencyKeys: item.dependencyKeys
    })),
    allItemKeys
  )

  calculationGraphValidation.issues.forEach(issue => {
    if (issue.type === 'missing_answer_reference') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validation.invalid_calculation_reference',
        path: itemPathByKey.get(issue.itemKey) ?? ['sections']
      })
      return
    }

    if (issue.type === 'cycle') {
      issue.itemKeys.forEach(itemKey => {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'validation.calculation_cycle',
          path: itemPathByKey.get(itemKey) ?? ['sections']
        })
      })
    }
  })
})

type ScoringMatrixItem = z.infer<typeof ScoringMatrixItemSchema>
type OutcomeOption = z.infer<typeof OutcomeOptionSchema>
type Outcome = z.infer<typeof OutcomeSchema>
type Section = z.infer<typeof SectionSchema>
type SubSection = z.infer<typeof SubSectionSchema>
type DependencyOn = z.infer<typeof DependencyOnSchema>
type Dependency = z.infer<typeof DependencySchema>
type Question = z.infer<typeof QuestionSchema>
type Calculation = z.infer<typeof CalculationSchema>
type AssessmentQuestionItem = z.infer<typeof AssessmentQuestionItemSchema>
type CommentThreshold = z.infer<typeof MinMaxSchema>
type Impactors = z.infer<typeof ImpactorsSchema>
type AssessmentDefinition = z.infer<typeof AssessmentDefinitionSchema>
type HelpersDependency = z.infer<typeof HelpersDependencySchema>
type AnswerDependency = z.infer<typeof AnswerDependencySchema>

type Helpers = z.infer<typeof HelpersSchema>

export { AssessmentDefinitionSchema, AssessmentSchema, HelpersSchema }
export type {
  AnswerDependency,
  AssessmentQuestionItem,
  Calculation,
  HelpersDependency,
  ScoringMatrixItem,
  OutcomeOption,
  Outcome,
  Section,
  SubSection,
  Dependency,
  CommentThreshold,
  Question,
  Impactors,
  AssessmentDefinition,
  DependencyOn,
  Helpers
}
