import type { AssessmentCalculationExpression } from '~~/shared/types/schemas/assessment/calculation'

/**
 * Builds the default expression for a calculation node kind.
 *
 * @param kind - Requested expression kind.
 * @param options - Node context used for root and helper defaults.
 * @param options.depth - Current calculation node depth.
 * @param options.defaultHelperField - Default helper field for helper expressions.
 * @returns Default calculation expression for the requested node.
 */
export const createDefaultAssessmentCalculationExpression = (
  kind: AssessmentCalculationExpression['kind'],
  options: {
    depth: number
    defaultHelperField: string
  }
): AssessmentCalculationExpression => {
  if (options.depth === 0 || kind === 'operation') {
    return {
      kind: 'operation',
      operator: 'sum',
      args: [{ kind: 'number', value: 0 }]
    }
  }

  if (kind === 'number') {
    return { kind: 'number', value: 0 }
  }

  if (kind === 'boolean') {
    return { kind: 'boolean', value: false }
  }

  if (kind === 'answer') {
    return {
      kind: 'answer',
      section: '',
      subsection: '',
      question: ''
    }
  }

  if (kind === 'helper') {
    return {
      kind: 'helper',
      field: options.defaultHelperField
    }
  }

  return {
    kind: 'operation',
    operator: 'sum',
    args: [{ kind: 'number', value: 0 }]
  }
}
