/* eslint-disable jsdoc/require-jsdoc -- Execution selects saved decisions, never live Agreement values. */
import type { PublishedWorkflowConfiguration } from './workflow-setup-versioning'
import { WorkflowRouteValidationError, type WorkflowRoutingDecisions, type WorkflowRoutingEvidence } from './workflow-routing-contract'

export const selectWorkflowRoute = (
  definition: PublishedWorkflowConfiguration, decisions: WorkflowRoutingDecisions
): PublishedWorkflowConfiguration => {
  const eligibleIds = new Set(decisions.filter(decision => decision.eligible).map(decision => decision.memberId))
  return { ...definition, members: definition.members.filter(member => eligibleIds.has(member.memberId)) }
}

export const assertWorkflowRouteRequirements = (route: PublishedWorkflowConfiguration): void => {
  if (!route.members.length) throw new WorkflowRouteValidationError('Workflow route is empty')
  if (route.purpose === 'approval_submission' && !route.members.some(member => member.kind === 'approval_template'
    || member.recommendationPlan?.finalApproval || member.recommendationPlan?.members.some(candidate => candidate.approval))) {
    throw new WorkflowRouteValidationError('Workflow route requires approval')
  }
  if (route.riskRatingEffect && !route.members.some(member => member.memberId === route.riskRatingEffect!.workflowMemberId)) {
    throw new WorkflowRouteValidationError('Workflow route requires its risk assessment')
  }
}

/**
 * Resolves execution from saved decisions, preserving historical unconditional attempts.
 * @param definition - The attempt's pinned publication.
 * @param routing - Immutable routing evidence, absent for legacy unconditional attempts.
 * @returns The selected members in their original publication order.
 */
export const resolveWorkflowExecutionPlan = (
  definition: PublishedWorkflowConfiguration, routing: WorkflowRoutingEvidence | null | undefined
): PublishedWorkflowConfiguration => {
  if (!definition.members.some(member => member.conditions?.length)) return definition
  if (!routing) throw new WorkflowRouteValidationError('Conditional workflow runtime is missing captured routing evidence')
  return selectWorkflowRoute(definition, routing.decisions)
}
