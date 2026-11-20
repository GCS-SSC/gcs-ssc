/* eslint-disable jsdoc/require-jsdoc -- Pure simulation of one explicit scenario against a draft workflow plan. */
import type {
  WorkflowSimulation, WorkflowSimulationAssessmentHelperValue, WorkflowSimulationAssessmentScenario, WorkflowSimulationOutcome, WorkflowSimulationResultValue,
  WorkflowSimulationScenario, WorkflowSimulationStep
} from '~~/shared/types/schemas/workflow-simulation'
import {
  isWorkflowResultCondition, workflowConditionKey, type WorkflowStartCondition
} from '~~/shared/types/schemas/agreement-custom-fields'
import { resolveNextWorkflowStep } from './workflow-result-routing'
import { isCoreEntityType, requiresTerminalApprovalSubmissionSuccess } from '~~/shared/constants/entity-registry'
import { isRepresentableByNumeric } from '~~/shared/utils/decimal'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { isCanonicalMoney } from '~~/shared/utils/money'
import { buildAssessmentRuntimeSummary } from '~~/shared/utils/assessment'
import { AssessmentResponseSchema } from '~~/shared/types/schemas/assessment/assessmentresponse'
import type { AssessmentHelperDataType } from '~~/shared/utils/assessment-helpers'
import type { WorkflowResultSource } from './workflow-result-sources'
import { isConfiguredNegativeRecommendation, isConfiguredNegativeReview } from '~~/shared/utils/workflow-configured-outcome'
import { evaluateWorkflowConditions } from './workflow-condition-evaluation'
import { assertWorkflowRouteRequirements, hasWorkflowMemberApproval, selectWorkflowRoute, usesWorkflowResultConditions } from './workflow-execution-plan'
import {
  validatePublishedWorkflowStatusGraph, type PublishedWorkflowConfiguration, type PublishedWorkflowMember, type WorkflowStatusGraphDefinition
} from './workflow-setup-versioning'

type SimulatedResults = NonNullable<NonNullable<WorkflowSimulationScenario['outcomes']>[string]['results']>
type SelectedOutcome = NonNullable<WorkflowSimulationScenario['outcomes']>[string]
type ConditionEvaluation = WorkflowSimulationStep['conditions'][number]

const readStaticInput = (
  condition: WorkflowStartCondition, scenario: WorkflowSimulationScenario
): ConditionEvaluation['actual'] => 'fieldId' in condition
  ? scenario.customFields?.[condition.fieldId] ?? null
  : scenario.profile?.[condition.source] ?? null

const matchesHelperType = (value: WorkflowSimulationAssessmentHelperValue, type: AssessmentHelperDataType): boolean => {
  if (value === null) return true
  if (type === 'money') return isCanonicalMoney(value)
  if (type === 'id') return typeof value === 'string' && isPositivePostgresBigintText(value)
  if (type === 'id_list') return Array.isArray(value) && value.every(isPositivePostgresBigintText)
  return typeof value === type
}

const calculateSimulatedAssessmentScore = (
  source: WorkflowResultSource, scenario: WorkflowSimulationAssessmentScenario
): number | undefined => {
  if (!source.assessment || !source.assessmentSchema) return undefined
  const helpers = scenario.helpers ?? {}
  const helperTypes = new Map(source.assessment.helpers.map(definition => [definition.field, definition.dataType]))
  if (Object.entries(helpers).some(([field, value]) => {
    const type = helperTypes.get(field)
    return !type || !matchesHelperType(value, type)
  })) return undefined
  const response = AssessmentResponseSchema.safeParse({ answers: scenario.answers ?? [] })
  if (!response.success) return undefined
  if (response.data.answers.some(answer => !source.assessment?.questions.some(question =>
    question.section === answer.section && question.subsection === answer.subsection && question.question === answer.question
    && question.options.some(option => option.value === answer.value)))) return undefined

  const runtime = buildAssessmentRuntimeSummary(response.data, source.assessmentSchema, helpers)
  if (runtime.blockingIssues.some(issue => issue.message === 'validation.incomplete_assessment_answers'
    || issue.message === 'validation.duplicate_answer')) return undefined
  return runtime.score.weightedScore
}

const availableResults = (
  inputs: readonly WorkflowResultSource[], supplied: SelectedOutcome | undefined
): SimulatedResults => {
  const available: SimulatedResults = {}
  for (const input of inputs) {
    const { source, nestedMemberId } = input
    const assessment = supplied?.assessments?.[nestedMemberId]
    const value = supplied?.results?.[nestedMemberId]
      ?? (source === 'assessment_score' && assessment ? calculateSimulatedAssessmentScore(input, assessment) : undefined)
    if (source === 'assessment_score' && typeof value === 'number' && isRepresentableByNumeric(value, 10, 2)) {
      // Assessment results enter workflow routing only after NUMERIC(10,2) persistence.
      available[nestedMemberId] = Math.round(value * 100) / 100
    }
    if (source === 'recommendation_result' && typeof value === 'boolean') available[nestedMemberId] = value
    if (source === 'checklist_result' && typeof value === 'string') available[nestedMemberId] = value
  }
  return available
}

const configuredNegative = (member: PublishedWorkflowMember, nestedMemberId: string, result: WorkflowSimulationResultValue): boolean => {
  const review = member.reviewPlan?.members.find(candidate => candidate.memberId === nestedMemberId)
  if (review) {
    return isConfiguredNegativeReview({
      failOnChecklistFailure: review.failOnChecklistFailure,
      checklistResult: typeof result === 'string' ? result : null,
      failureThreshold: review.failureThreshold,
      score: typeof result === 'number' ? result : null
    })
  }
  const recommendation = member.recommendationPlan?.members.find(candidate => candidate.memberId === nestedMemberId)
  return Boolean(recommendation && isConfiguredNegativeRecommendation(result === false ? 'not_recommended' : null, recommendation.failOnNotRecommended))
}

const resolveOutcome = (
  member: PublishedWorkflowMember, inputs: readonly WorkflowResultSource[], results: SimulatedResults,
  supplied: SelectedOutcome | undefined, allowed: readonly WorkflowSimulationOutcome[]
): WorkflowSimulationStep['outcome'] => {
  if (supplied?.state && supplied.state !== 'succeeded' && allowed.includes(supplied.state)) return supplied.state

  // Sequential sets can finish early when a configured result stops a member.
  // Parallel reviews must finish collecting results before the set can aggregate.
  const sequential = member.reviewPlan?.sequential ?? true
  let negative = false
  for (const input of inputs) {
    const result = results[input.nestedMemberId]
    if (result === undefined) return null
    negative ||= configuredNegative(member, input.nestedMemberId, result)
    if (negative && sequential) return 'unsuccessful'
  }
  if (negative) return 'unsuccessful'
  if (supplied?.state !== 'succeeded') return null
  return hasWorkflowMemberApproval(member) ? 'approved' : 'succeeded'
}

export const simulateWorkflow = (
  definition: PublishedWorkflowConfiguration,
  sources: ReadonlyMap<string, readonly WorkflowResultSource[]>,
  statuses: ReadonlyMap<string, WorkflowStatusGraphDefinition>,
  scenario: WorkflowSimulationScenario
): WorkflowSimulation => {
  const staticDecisions = evaluateWorkflowConditions(definition, {
    agreementId: null, values: scenario.customFields ?? {}, fields: [], profile: scenario.profile
  })
  const selected = selectWorkflowRoute(definition, staticDecisions)
  const authoredResults = usesWorkflowResultConditions(definition)
  const simulation: WorkflowSimulation = { status: 'succeeded', finishReason: null, steps: [] }
  let stopped = false
  let reachedTerminalStatus = false
  try {
    if (!authoredResults) assertWorkflowRouteRequirements(selected)
    validatePublishedWorkflowStatusGraph(authoredResults ? definition : selected, statuses)
  } catch {
    simulation.status = 'blocked'
    simulation.finishReason = 'route_invalid'
    stopped = true
  }

  const completed = new Map<string, SimulatedResults>()
  let completedSequence = 0
  const selectNext = () => {
    const traversal = resolveNextWorkflowStep(selected, completedSequence)
    let step = traversal.next()
    while (!step.done) {
      const { source, condition } = step.value
      const input = sources.get(source.memberId)?.find(candidate =>
        candidate.nestedMemberId === condition.nestedMemberId && candidate.source === condition.source)
      const actual = input ? completed.get(source.memberId)?.[input.nestedMemberId] ?? null : null
      step = traversal.next({ actual, sourceRuntimeItemId: null })
    }
    return step.value
  }
  let next: ReturnType<typeof selectNext> | undefined
  simulation.steps = definition.members.map((member, index): WorkflowSimulationStep => {
    const inputs = [...sources.get(member.memberId) ?? []]
    const allowedStates: WorkflowSimulationOutcome[] = ['succeeded', 'failed', 'cancelled']
    if (hasWorkflowMemberApproval(member)) allowedStates.push('denied')
    const base = {
      memberId: member.memberId, sequence: member.sequence, outcome: null, allowedStates,
      inputs: inputs.map(({ assessmentSchema: _assessmentSchema, ...input }) => input)
    }
    const staticDecision = staticDecisions[index]
    const conditions: ConditionEvaluation[] = (member.conditions ?? []).flatMap(({ name_en, name_fr, options: _options, ...condition }) => {
      if (isWorkflowResultCondition(condition)) return []
      return [{
        condition, nameEn: name_en, nameFr: name_fr, actual: readStaticInput(condition, scenario),
        matched: staticDecision?.conditions?.find(candidate => candidate.key === workflowConditionKey(condition))?.matched ?? false
      }]
    })
    if (stopped) return { ...base, conditions, state: 'not_reached', reason: simulation.status === 'awaiting_input' ? null : 'terminal' }
    if (!staticDecision?.eligible) return { ...base, conditions, state: 'skipped', reason: 'condition_unmet' }

    next ??= selectNext()
    for (const result of next.appended[member.memberId] ?? []) {
      conditions.push({
        condition: result.condition, nameEn: result.name_en, nameFr: result.name_fr,
        actual: result.actual, matched: result.matched
      })
    }
    if (next.member?.memberId !== member.memberId) {
      return {
        ...base, conditions, state: 'skipped',
        reason: conditions.some(condition => !condition.matched && condition.actual === null) ? 'source_unavailable' : 'condition_unmet'
      }
    }
    next = undefined
    completedSequence = member.sequence

    const supplied = scenario.outcomes?.[member.memberId]
    const results = availableResults(inputs, supplied)
    const outcome = resolveOutcome(member, inputs, results, supplied, allowedStates)
    if (outcome === null) {
      simulation.status = 'awaiting_input'
      stopped = true
      return { ...base, conditions, state: 'awaiting_input', reason: null }
    }
    if (outcome === 'succeeded' || outcome === 'approved') {
      completed.set(member.memberId, results)
      if (outcome === 'approved') simulation.status = 'approved'
      if (member.successStatus && statuses.get(member.successStatus)?.terminal) {
        reachedTerminalStatus = true
        stopped = true
      }
    } else {
      simulation.status = outcome
      stopped = true
    }
    return { ...base, conditions, outcome, state: 'run', reason: null }
  })

  if (definition.purpose === 'approval_submission' && (simulation.status === 'succeeded' || simulation.status === 'approved')) {
    if (isCoreEntityType(definition.entityType) && requiresTerminalApprovalSubmissionSuccess(definition.entityType) && !reachedTerminalStatus) {
      simulation.status = 'failed'
      simulation.finishReason = 'terminal_status_required'
    } else if (definition.entityType === 'fundingcasecorrection' && simulation.status !== 'approved') {
      simulation.status = 'failed'
      simulation.finishReason = 'correction_approval_required'
    }
  }
  return simulation
}
