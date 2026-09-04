/* eslint-disable jsdoc/require-jsdoc -- explicit typed signatures keep the calculation helpers self-describing */
import type {
  AssessmentCalculationExpression,
  AssessmentCalculationOperator
} from '../types/schemas/assessment/calculation'

export type AssessmentCalculationItemDescriptor = {
  key: string
  section: string
  subsection: string
  question: string
  expression: AssessmentCalculationExpression
  dependencyKeys?: string[]
}

export type AssessmentCalculationIssue =
  | {
    type: 'missing_answer_reference'
    itemKey: string
    referenceKey: string
  }
  | {
    type: 'cycle'
    itemKeys: string[]
  }

export type AssessmentCalculationGraphValidationResult = {
  issues: AssessmentCalculationIssue[]
  referencedCalculationKeysByItem: Map<string, Set<string>>
}

export type AssessmentCalculationValueRow = {
  section: string
  subsection: string
  question: string
  value: number
}

type AssessmentDependencyReference =
  {
    on: {
      type: string
      section?: string
      subsection?: string
      question?: string
    }
  }
type AssessmentDependency = AssessmentDependencyReference | AssessmentDependencyReference[]

const normalizeNumber = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Number.parseFloat(value.toFixed(2))
}

export const buildAssessmentCalculationKey = (
  section: string,
  subsection: string,
  question: string
) => [section, subsection, question].map(encodeURIComponent).join('::')

const buildDependencyAnswerKey = (dependency: AssessmentDependencyReference) => {
  if (
    dependency.on.type !== 'answers'
    || dependency.on.section === undefined
    || dependency.on.subsection === undefined
    || dependency.on.question === undefined
  ) {
    return []
  }

  return [buildAssessmentCalculationKey(dependency.on.section, dependency.on.subsection, dependency.on.question)]
}

export const collectDependencyAnswerKeys = (depends?: AssessmentDependency[]) => {
  if (!depends) {
    return []
  }

  return depends.flatMap(dependency => {
    if (Array.isArray(dependency)) {
      return dependency.flatMap(buildDependencyAnswerKey)
    }

    return buildDependencyAnswerKey(dependency)
  })
}

export const collectCalculationAnswerReferenceKeys = (expression: AssessmentCalculationExpression): string[] => {
  if (expression.kind === 'answer') {
    return [buildAssessmentCalculationKey(expression.section, expression.subsection, expression.question)]
  }

  if (expression.kind !== 'operation') {
    return []
  }

  return expression.args.flatMap(collectCalculationAnswerReferenceKeys)
}

export const collectCalculationHelperFields = (expression: AssessmentCalculationExpression): string[] => {
  if (expression.kind === 'helper') {
    return [expression.field]
  }

  if (expression.kind !== 'operation') {
    return []
  }

  return expression.args.flatMap(collectCalculationHelperFields)
}

export const validateAssessmentCalculationGraph = (
  items: AssessmentCalculationItemDescriptor[],
  allItemKeys: Set<string>
): AssessmentCalculationGraphValidationResult => {
  const calculationItemKeys = new Set(items.map(item => item.key))
  const referencedCalculationKeysByItem = new Map<string, Set<string>>()
  const issues: AssessmentCalculationIssue[] = []

  items.forEach(item => {
    const referenceKeys = new Set([
      ...collectCalculationAnswerReferenceKeys(item.expression),
      ...(item.dependencyKeys ?? [])
    ])

    referenceKeys.forEach(referenceKey => {
      if (!allItemKeys.has(referenceKey)) {
        issues.push({
          type: 'missing_answer_reference',
          itemKey: item.key,
          referenceKey
        })
        return
      }

      if (!calculationItemKeys.has(referenceKey)) {
        return
      }

      if (!referencedCalculationKeysByItem.has(item.key)) {
        referencedCalculationKeysByItem.set(item.key, new Set<string>())
      }

      referencedCalculationKeysByItem.get(item.key)?.add(referenceKey)
    })
  })

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const seenCycles = new Set<string>()

  const visit = (key: string, path: string[]) => {
    if (visiting.has(key)) {
      const cycleStartIndex = path.indexOf(key)
      const cycleKeys = cycleStartIndex >= 0 ? path.slice(cycleStartIndex) : [key]
      const normalizedCycle = [...cycleKeys].sort().join('|')

      if (!seenCycles.has(normalizedCycle)) {
        seenCycles.add(normalizedCycle)
        issues.push({
          type: 'cycle',
          itemKeys: cycleKeys
        })
      }
      return
    }

    if (visited.has(key)) {
      return
    }

    visiting.add(key)
    const nextPath = [...path, key]
    referencedCalculationKeysByItem.get(key)?.forEach(referenceKey => {
      visit(referenceKey, nextPath)
    })
    visiting.delete(key)
    visited.add(key)
  }

  items.forEach(item => {
    visit(item.key, [])
  })

  return {
    issues,
    referencedCalculationKeysByItem
  }
}

const toNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  return value
}

const toBoolean = (value: unknown): boolean | undefined => {
  if (typeof value !== 'boolean') {
    return undefined
  }

  return value
}

type CalculationOperationEvaluator = (values: unknown[]) => unknown
type NumericBinaryEvaluator = (left: number, right: number) => unknown

const getNumericValues = (values: unknown[]): number[] | undefined => {
  const numericValues = values.map(toNumber)

  if (!numericValues.every(value => value !== undefined)) {
    return undefined
  }

  return numericValues.map(Number)
}

const getBooleanValues = (values: unknown[]): boolean[] | undefined => {
  const booleanValues = values.map(toBoolean)

  if (!booleanValues.every(value => value !== undefined)) {
    return undefined
  }

  return booleanValues.map(Boolean)
}

const evaluateNumericBinaryOperation = (
  values: unknown[],
  evaluator: NumericBinaryEvaluator
): unknown => {
  const left = toNumber(values[0])
  const right = toNumber(values[1])

  return left !== undefined && right !== undefined ? evaluator(left, right) : undefined
}

const evaluateNumericListOperation = (
  values: unknown[],
  evaluator: (numericValues: number[]) => number
): number | undefined => {
  const numericValues = getNumericValues(values)

  return numericValues !== undefined && numericValues.length > 0 ? evaluator(numericValues) : undefined
}

const sumNumbers = (values: number[]) => values.reduce((total, value) => total + value, 0)

const calculationOperationEvaluators: Record<AssessmentCalculationOperator, CalculationOperationEvaluator> = {
  add: values => evaluateNumericBinaryOperation(values, (left, right) => left + right),
  subtract: values => evaluateNumericBinaryOperation(values, (left, right) => left - right),
  multiply: values => evaluateNumericBinaryOperation(values, (left, right) => left * right),
  divide: values => evaluateNumericBinaryOperation(values, (left, right) => right === 0 ? undefined : left / right),
  sum: values => {
    const numericValues = getNumericValues(values)
    return numericValues !== undefined ? sumNumbers(numericValues) : undefined
  },
  average: values => evaluateNumericListOperation(values, numericValues => sumNumbers(numericValues) / numericValues.length),
  min: values => evaluateNumericListOperation(values, numericValues => Math.min(...numericValues)),
  max: values => evaluateNumericListOperation(values, numericValues => Math.max(...numericValues)),
  round: values => {
    const value = toNumber(values[0])
    const precision = toNumber(values[1])

    if (value === undefined || precision === undefined) {
      return undefined
    }

    const multiplier = 10 ** Math.max(0, Math.trunc(precision))
    return Math.round(value * multiplier) / multiplier
  },
  clamp: values => {
    const value = toNumber(values[0])
    const min = toNumber(values[1])
    const max = toNumber(values[2])

    return value !== undefined && min !== undefined && max !== undefined
      ? Math.min(Math.max(value, min), max)
      : undefined
  },
  coalesce: values => values.find(value => value !== undefined && value !== null),
  if: values => {
    const condition = toBoolean(values[0])
    return condition === undefined ? undefined : condition ? values[1] : values[2]
  },
  eq: values => values[0] === values[1],
  ne: values => values[0] !== values[1],
  gt: values => evaluateNumericBinaryOperation(values, (left, right) => left > right),
  gte: values => evaluateNumericBinaryOperation(values, (left, right) => left >= right),
  lt: values => evaluateNumericBinaryOperation(values, (left, right) => left < right),
  lte: values => evaluateNumericBinaryOperation(values, (left, right) => left <= right),
  and: values => {
    const booleanValues = getBooleanValues(values)
    return booleanValues !== undefined ? booleanValues.every(Boolean) : undefined
  },
  or: values => {
    const booleanValues = getBooleanValues(values)
    return booleanValues !== undefined ? booleanValues.some(Boolean) : undefined
  },
  not: values => {
    const value = toBoolean(values[0])
    return value === undefined ? undefined : !value
  }
}

const evaluateCalculationOperation = (
  operator: AssessmentCalculationOperator,
  values: unknown[]
): unknown => calculationOperationEvaluators[operator](values)

const evaluateAssessmentCalculationExpression = (
  expression: AssessmentCalculationExpression,
  valuesByKey: Map<string, number | null | undefined>,
  helpers: Record<string, unknown>
): unknown => {
  if (expression.kind === 'number' || expression.kind === 'boolean') {
    return expression.value
  }

  if (expression.kind === 'answer') {
    return valuesByKey.get(buildAssessmentCalculationKey(expression.section, expression.subsection, expression.question))
  }

  if (expression.kind === 'helper') {
    return helpers[expression.field]
  }

  const evaluatedArgs = expression.args.map(argument =>
    evaluateAssessmentCalculationExpression(argument, valuesByKey, helpers)
  )

  return evaluateCalculationOperation(expression.operator, evaluatedArgs)
}

export const resolveAssessmentCalculationValues = (
  items: AssessmentCalculationItemDescriptor[],
  manualValuesByKey: Map<string, number | null | undefined>,
  helpers: Record<string, unknown>,
  isItemApplicable: (item: AssessmentCalculationItemDescriptor, valuesByKey: Map<string, number | null | undefined>) => boolean
): AssessmentCalculationValueRow[] => {
  const valuesByKey = new Map(manualValuesByKey)
  const remainingItems = new Map(items.map(item => [item.key, item]))
  const resolvedItems = new Set<string>()
  const calculatedValues: AssessmentCalculationValueRow[] = []
  let madeProgress = true

  while (remainingItems.size > 0 && madeProgress) {
    madeProgress = false

    for (const [itemKey, item] of remainingItems.entries()) {
      const dependencyKeys = [
        ...collectCalculationAnswerReferenceKeys(item.expression),
        ...(item.dependencyKeys ?? [])
      ].filter(dependencyKey => remainingItems.has(dependencyKey))

      if (dependencyKeys.some(dependencyKey => !resolvedItems.has(dependencyKey))) {
        continue
      }

      if (!isItemApplicable(item, valuesByKey)) {
        remainingItems.delete(itemKey)
        resolvedItems.add(itemKey)
        madeProgress = true
        continue
      }

      const resolvedValue = evaluateAssessmentCalculationExpression(item.expression, valuesByKey, helpers)
      const normalizedValue = toNumber(resolvedValue)

      if (normalizedValue !== undefined) {
        const value = normalizeNumber(normalizedValue)
        valuesByKey.set(item.key, value)
        calculatedValues.push({
          section: item.section,
          subsection: item.subsection,
          question: item.question,
          value
        })
      }

      remainingItems.delete(itemKey)
      resolvedItems.add(itemKey)
      madeProgress = true
    }
  }

  return calculatedValues
}
