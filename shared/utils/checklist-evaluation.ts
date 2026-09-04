/* eslint-disable jsdoc/require-jsdoc -- exported domain types and functions are self-describing */
import type {
  ChecklistAnswer,
  ChecklistDefinition,
  ChecklistResponse,
  ChecklistResult,
  ChecklistResultGroup,
  ChecklistResultGroupMode,
  ChecklistResultPolicyItem
} from '../types/schemas/checklist/checklist'
import {
  ChecklistDefinitionSchema,
  ChecklistResponsesSchema
} from '../types/schemas/checklist/checklist'

export type ChecklistAggregateSummary = {
  total: number
  answered: number
  pass: number
  fail: number
  passRate: number
  failRate: number
}

export type ChecklistQuestionFailureTrace = {
  kind: 'question_failed'
  questionKey: string
  matched: boolean
  actualAnswer?: ChecklistAnswer
}

export type ChecklistResultGroupTrace = {
  kind: 'group'
  key: string
  mode: ChecklistResultGroupMode
  result: ChecklistResult
  matched: boolean
  matchedItemCount: number
  totalItemCount: number
  threshold?: number
  children: ChecklistResultPolicyItemTrace[]
  exposedResults: ChecklistResult[]
  triggeringQuestionKeys: string[]
}

export type ChecklistResultPolicyItemTrace = ChecklistQuestionFailureTrace | ChecklistResultGroupTrace

export type ChecklistEvaluationTrace = {
  policyMode: 'any_failure_fails' | 'custom_groups'
  shortcutMatched: boolean
  strongestMatchedGroupKey: string | null
  triggeringQuestionKeys: string[]
  groups: ChecklistResultGroupTrace[]
  overall: ChecklistAggregateSummary
}

export type ChecklistEvaluation = {
  result: ChecklistResult
  trace: ChecklistEvaluationTrace
}

export type ChecklistResponseValidationIssue = {
  questionKey: string
  type: 'missing_required_answer' | 'missing_required_comment' | 'unknown_question'
}

export const isChecklistQuestionResponseComplete = (
  question: ChecklistDefinition['sections'][number]['questions'][number],
  response?: Pick<ChecklistResponse, 'comment'> & { answer: ChecklistAnswer | null }
) => {
  if (response === undefined || response.answer === null) {
    return false
  }

  const commentRequired = question.commentPolicy === 'required'
    || (question.commentPolicy === 'required_on_fail' && response.answer === 'fail')

  return !commentRequired || String(response.comment ?? '').trim().length > 0
}

type ExposedResult = {
  result: ChecklistResult
  groupKey: string
  triggeringQuestionKeys: string[]
}

type EvaluatedPolicyItem = {
  trace: ChecklistResultPolicyItemTrace
  exposedResults: ExposedResult[]
}

const RESULT_PRIORITY: Record<ChecklistResult, number> = {
  pass: 0,
  pass_with_considerations: 1,
  fail: 2
}

const roundRate = (value: number) => Number.parseFloat(value.toFixed(2))

export const getChecklistSectionQuestions = (
  section: ChecklistDefinition['sections'][number]
) => [
  ...(section.questions ?? []),
  ...(section.subSections ?? []).flatMap(subSection => subSection.questions)
]

export const getChecklistQuestions = (definition: ChecklistDefinition) => (
  definition.sections.flatMap(getChecklistSectionQuestions)
)

const buildAggregate = (
  definition: ChecklistDefinition,
  responsesByQuestionKey: Map<string, ChecklistResponse>
): ChecklistAggregateSummary => {
  const questions = getChecklistQuestions(definition)
  const responses = questions
    .map(question => responsesByQuestionKey.get(question.key))
    .filter(response => response !== undefined)
  const pass = responses.filter(response => response.answer === 'pass').length
  const fail = responses.filter(response => response.answer === 'fail').length
  const answered = responses.length

  return {
    total: questions.length,
    answered,
    pass,
    fail,
    passRate: answered === 0 ? 0 : roundRate((pass / answered) * 100),
    failRate: answered === 0 ? 0 : roundRate((fail / answered) * 100)
  }
}

const isGroupMatched = (
  group: ChecklistResultGroup,
  matchedItemCount: number
) => {
  if (group.mode === 'any') {
    return matchedItemCount > 0
  }
  if (group.mode === 'all') {
    return matchedItemCount === group.items.length
  }
  if (group.mode === 'at_least_count') {
    return group.threshold !== undefined && matchedItemCount >= group.threshold
  }

  return group.threshold !== undefined && (matchedItemCount / group.items.length) * 100 >= group.threshold
}

const uniqueQuestionKeys = (keys: string[]) => [...new Set(keys)]

const evaluatePolicyItem = (
  item: ChecklistResultPolicyItem,
  responsesByQuestionKey: Map<string, ChecklistResponse>
): EvaluatedPolicyItem => {
  if (item.kind === 'question_failed') {
    const actualAnswer = responsesByQuestionKey.get(item.questionKey)?.answer
    return {
      trace: {
        kind: item.kind,
        questionKey: item.questionKey,
        matched: actualAnswer === 'fail',
        ...(actualAnswer === undefined ? {} : { actualAnswer })
      },
      exposedResults: []
    }
  }

  const evaluatedChildren = item.items.map(child => evaluatePolicyItem(child, responsesByQuestionKey))
  const children = evaluatedChildren.map(child => child.trace)
  const matchedChildren = children.filter(child => child.matched)
  const matched = isGroupMatched(item, matchedChildren.length)
  const triggeringQuestionKeys = matched
    ? uniqueQuestionKeys(matchedChildren.flatMap(child => (
        child.kind === 'question_failed' ? [child.questionKey] : child.triggeringQuestionKeys
      )))
    : []
  const descendantResults = matched
    ? evaluatedChildren.flatMap(child => child.trace.matched ? child.exposedResults : [])
    : []
  const exposedResults: ExposedResult[] = matched
    ? [{ result: item.result, groupKey: item.key, triggeringQuestionKeys }, ...descendantResults]
    : []

  return {
    trace: {
      kind: item.kind,
      key: item.key,
      mode: item.mode,
      result: item.result,
      matched,
      matchedItemCount: matchedChildren.length,
      totalItemCount: children.length,
      ...(item.threshold === undefined ? {} : { threshold: item.threshold }),
      children,
      exposedResults: exposedResults.map(exposed => exposed.result),
      triggeringQuestionKeys
    },
    exposedResults
  }
}

const getStrongestResult = (results: ExposedResult[]): ExposedResult | undefined => results.reduce<ExposedResult | undefined>(
  (strongest, candidate) => strongest === undefined || RESULT_PRIORITY[candidate.result] > RESULT_PRIORITY[strongest.result]
    ? candidate
    : strongest,
  undefined
)

export const validateChecklistResponses = (
  definitionInput: ChecklistDefinition,
  responsesInput: ChecklistResponse[],
  requireComplete = false
): ChecklistResponseValidationIssue[] => {
  const definition = ChecklistDefinitionSchema.parse(definitionInput)
  const responses = ChecklistResponsesSchema.parse(responsesInput)
  const questions = getChecklistQuestions(definition)
  const questionKeys = new Set(questions.map(question => question.key))
  const responsesByQuestionKey = new Map(responses.map(response => [response.questionKey, response]))
  const issues: ChecklistResponseValidationIssue[] = []

  responses.forEach(response => {
    if (!questionKeys.has(response.questionKey)) {
      issues.push({ questionKey: response.questionKey, type: 'unknown_question' })
    }
  })

  questions.forEach(question => {
    const response = responsesByQuestionKey.get(question.key)
    if (requireComplete && question.required && response === undefined) {
      issues.push({ questionKey: question.key, type: 'missing_required_answer' })
      return
    }

    if (response === undefined) {
      return
    }

    if (!isChecklistQuestionResponseComplete(question, response)) {
      issues.push({ questionKey: question.key, type: 'missing_required_comment' })
    }
  })

  return issues
}

export const evaluateChecklist = (
  definitionInput: ChecklistDefinition,
  responsesInput: ChecklistResponse[]
): ChecklistEvaluation => {
  const definition = ChecklistDefinitionSchema.parse(definitionInput)
  const responses = ChecklistResponsesSchema.parse(responsesInput)
  const questionKeys = new Set(getChecklistQuestions(definition).map(question => question.key))
  const knownResponses = responses.filter(response => questionKeys.has(response.questionKey))

  const responsesByQuestionKey = new Map(knownResponses.map(response => [response.questionKey, response]))
  const overall = buildAggregate(definition, responsesByQuestionKey)
  if (definition.resultPolicy.anyFailureFails) {
    const triggeringQuestionKeys = knownResponses
      .filter(response => response.answer === 'fail')
      .map(response => response.questionKey)
    const shortcutMatched = triggeringQuestionKeys.length > 0
    return {
      result: shortcutMatched ? 'fail' : 'pass',
      trace: {
        policyMode: 'any_failure_fails',
        shortcutMatched,
        strongestMatchedGroupKey: null,
        triggeringQuestionKeys,
        groups: [],
        overall
      }
    }
  }

  const evaluatedGroups = definition.resultPolicy.groups.map(group => evaluatePolicyItem(group, responsesByQuestionKey))
  const strongest = getStrongestResult(evaluatedGroups.flatMap(group => group.exposedResults))
  return {
    result: strongest?.result ?? 'pass',
    trace: {
      policyMode: 'custom_groups',
      shortcutMatched: false,
      strongestMatchedGroupKey: strongest?.groupKey ?? null,
      triggeringQuestionKeys: strongest?.triggeringQuestionKeys ?? [],
      groups: evaluatedGroups.map(group => group.trace as ChecklistResultGroupTrace),
      overall
    }
  }
}
