/* eslint-disable jsdoc/require-jsdoc -- Pure evaluation of a pinned publication against captured values. */
import { isWorkflowResultCondition, workflowConditionKey, workflowConditionsMatch } from '~~/shared/types/schemas/agreement-custom-fields'
import type { PublishedWorkflowConfiguration } from './workflow-setup-versioning'
import type { WorkflowRoutingDecisions, WorkflowRoutingSnapshot } from './workflow-routing-contract'
import type { AgreementRoutingValues } from '~~/shared/types/schemas/agreement-custom-fields'

export const evaluateWorkflowConditions = (
  definition: PublishedWorkflowConfiguration, snapshot: Omit<WorkflowRoutingSnapshot, 'profile'> & { profile?: Partial<AgreementRoutingValues> }
): WorkflowRoutingDecisions => definition.members.map(member => {
  const conditions = (member.conditions ?? []).filter(condition => !isWorkflowResultCondition(condition)).map(condition => ({
    key: workflowConditionKey(condition),
    matched: workflowConditionsMatch([condition], snapshot.values, snapshot.profile),
    name_en: condition.name_en,
    name_fr: condition.name_fr,
    options: condition.options,
    ...('quantifier' in condition ? { quantifier: condition.quantifier } : {})
  }))
  return {
    memberId: member.memberId,
    eligible: conditions.every(condition => condition.matched),
    unmatchedFieldIds: conditions.filter(condition => !condition.matched).map(condition => condition.key),
    conditions
  }
})
