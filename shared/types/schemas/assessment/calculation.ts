import { z } from 'zod'

export const ASSESSMENT_CALCULATION_OPERATORS = [
  'add',
  'subtract',
  'multiply',
  'divide',
  'sum',
  'average',
  'min',
  'max',
  'round',
  'clamp',
  'coalesce',
  'if',
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'and',
  'or',
  'not'
] as const

export type AssessmentCalculationOperator = typeof ASSESSMENT_CALCULATION_OPERATORS[number]

export const ASSESSMENT_CALCULATION_OPERATOR_CONFIG: Record<
  AssessmentCalculationOperator,
  {
    labelKey: string
    minArgs: number
    maxArgs: number | null
  }
> = {
  add: { labelKey: 'transfer_payment.calculation_operator_add', minArgs: 2, maxArgs: 2 },
  subtract: { labelKey: 'transfer_payment.calculation_operator_subtract', minArgs: 2, maxArgs: 2 },
  multiply: { labelKey: 'transfer_payment.calculation_operator_multiply', minArgs: 2, maxArgs: 2 },
  divide: { labelKey: 'transfer_payment.calculation_operator_divide', minArgs: 2, maxArgs: 2 },
  sum: { labelKey: 'transfer_payment.calculation_operator_sum', minArgs: 1, maxArgs: null },
  average: { labelKey: 'transfer_payment.calculation_operator_average', minArgs: 1, maxArgs: null },
  min: { labelKey: 'transfer_payment.calculation_operator_min', minArgs: 1, maxArgs: null },
  max: { labelKey: 'transfer_payment.calculation_operator_max', minArgs: 1, maxArgs: null },
  round: { labelKey: 'transfer_payment.calculation_operator_round', minArgs: 2, maxArgs: 2 },
  clamp: { labelKey: 'transfer_payment.calculation_operator_clamp', minArgs: 3, maxArgs: 3 },
  coalesce: { labelKey: 'transfer_payment.calculation_operator_coalesce', minArgs: 1, maxArgs: null },
  if: { labelKey: 'transfer_payment.calculation_operator_if', minArgs: 3, maxArgs: 3 },
  eq: { labelKey: 'transfer_payment.calculation_operator_eq', minArgs: 2, maxArgs: 2 },
  ne: { labelKey: 'transfer_payment.calculation_operator_ne', minArgs: 2, maxArgs: 2 },
  gt: { labelKey: 'transfer_payment.calculation_operator_gt', minArgs: 2, maxArgs: 2 },
  gte: { labelKey: 'transfer_payment.calculation_operator_gte', minArgs: 2, maxArgs: 2 },
  lt: { labelKey: 'transfer_payment.calculation_operator_lt', minArgs: 2, maxArgs: 2 },
  lte: { labelKey: 'transfer_payment.calculation_operator_lte', minArgs: 2, maxArgs: 2 },
  and: { labelKey: 'transfer_payment.calculation_operator_and', minArgs: 1, maxArgs: null },
  or: { labelKey: 'transfer_payment.calculation_operator_or', minArgs: 1, maxArgs: null },
  not: { labelKey: 'transfer_payment.calculation_operator_not', minArgs: 1, maxArgs: 1 }
}

const RequiredString = (key: string) => z.string({ error: key }).min(1, { error: key })

const AssessmentCalculationNumberLiteralSchema = z.object({
  kind: z.literal('number'),
  value: z.coerce.number()
})

const AssessmentCalculationBooleanLiteralSchema = z.object({
  kind: z.literal('boolean'),
  value: z.boolean()
})

const AssessmentCalculationAnswerReferenceSchema = z.object({
  kind: z.literal('answer'),
  section: RequiredString('validation.section_required'),
  subsection: RequiredString('validation.subsection_required'),
  question: RequiredString('validation.required')
})

const AssessmentCalculationHelperReferenceSchema = z.object({
  kind: z.literal('helper'),
  field: RequiredString('validation.invalid_helper_field')
})

type AssessmentCalculationExpression =
  | z.infer<typeof AssessmentCalculationNumberLiteralSchema>
  | z.infer<typeof AssessmentCalculationBooleanLiteralSchema>
  | z.infer<typeof AssessmentCalculationAnswerReferenceSchema>
  | z.infer<typeof AssessmentCalculationHelperReferenceSchema>
  | {
    kind: 'operation'
    operator: AssessmentCalculationOperator
    args: AssessmentCalculationExpression[]
  }

export const AssessmentCalculationExpressionSchema: z.ZodType<AssessmentCalculationExpression> = z.lazy(() => z.discriminatedUnion('kind', [
  AssessmentCalculationNumberLiteralSchema,
  AssessmentCalculationBooleanLiteralSchema,
  AssessmentCalculationAnswerReferenceSchema,
  AssessmentCalculationHelperReferenceSchema,
  z.object({
    kind: z.literal('operation'),
    operator: z.enum(ASSESSMENT_CALCULATION_OPERATORS),
    args: z.array(AssessmentCalculationExpressionSchema).min(1, { error: 'validation.required' })
  }).superRefine((value, ctx) => {
    const operatorConfig = ASSESSMENT_CALCULATION_OPERATOR_CONFIG[value.operator]
    if (value.args.length < operatorConfig.minArgs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validation.calculation_operator_arguments',
        path: ['args']
      })
    }

    if (operatorConfig.maxArgs !== null && value.args.length > operatorConfig.maxArgs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validation.calculation_operator_arguments',
        path: ['args']
      })
    }
  })
]))

export const AssessmentCalculationFormulaSchema = AssessmentCalculationExpressionSchema.refine(
  value => value.kind === 'operation',
  {
    error: 'validation.calculation_root_operation_required'
  }
)

export type {
  AssessmentCalculationExpression
}
