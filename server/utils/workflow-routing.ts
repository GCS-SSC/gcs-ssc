import { createHash } from 'node:crypto'
/* eslint-disable jsdoc/require-jsdoc -- Captures Agreement-owned routing under the existing stream/Agreement lock order. */
import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { ReviewRuntimeEntityContext } from './review-runtime-access'
import { readAgreementCustomFieldDefinitions } from './agreement-custom-fields'
import { customFieldOptionIds, workflowConditionsMatch, type AgreementCustomFieldValues } from '~~/shared/types/schemas/agreement-custom-fields'
import { validatePublishedWorkflowStatusGraph, type PublishedWorkflowConfiguration } from './workflow-setup-versioning'

export class WorkflowRouteValidationError extends Error {}

export type WorkflowRoutingEvidence = {
  hash: string
  fields: Array<{ fieldId: string, name_en: string, name_fr: string, optionId: string, option_en: string, option_fr: string }>
  agreementId: string | null
  values: AgreementCustomFieldValues
  decisions: Array<{ memberId: string, eligible: boolean, unmatchedFieldIds: string[] }>
}
export const captureWorkflowRouting = async (
  trx: Transaction<Database>, context: ReviewRuntimeEntityContext, definition: PublishedWorkflowConfiguration
): Promise<WorkflowRoutingEvidence> => {
  const referencedIds = [...new Set(definition.members.flatMap(member => (member.conditions ?? []).map(condition => condition.fieldId)))]
  const agreementId = context.entityType === 'fundingcaseagreement' ? context.entityId : context.agreementId ?? null
  const values: AgreementCustomFieldValues = {}
  const capturedFields: WorkflowRoutingEvidence['fields'] = []
  if (referencedIds.length) {
    if (!agreementId) throw new WorkflowRouteValidationError('Conditional workflow requires an owning Agreement')
    const agreement = await trx.selectFrom('Funding_Case_Agreement_Profile').select(['egcs_fc_customfields', 'egcs_fc_transferpaymentstream'])
      .where('id', '=', agreementId).where('_deleted', '=', false).forUpdate().executeTakeFirstOrThrow()
    const fields = await readAgreementCustomFieldDefinitions(trx, agreement.egcs_fc_transferpaymentstream)
    for (const fieldId of referencedIds) {
      const field = fields.find(candidate => candidate.id === fieldId)
      const value = customFieldOptionIds(agreement.egcs_fc_customfields[fieldId])
      if (!field || field.kind !== 'relational' || !value.length || value.some(optionId => !field.options.some(option => option.id === optionId))) {
        throw new WorkflowRouteValidationError('Workflow discriminator value is missing or invalid')
      }
      values[fieldId] = value
      for (const optionId of value) {
        const option = field.options.find(candidate => candidate.id === optionId)!
        capturedFields.push({ fieldId, name_en: field.name_en, name_fr: field.name_fr, optionId, option_en: option.name_en, option_fr: option.name_fr })
      }
    }
  }
  const decisions = definition.members.map(member => ({
    memberId: member.memberId,
    eligible: workflowConditionsMatch(member.conditions ?? [], values),
    unmatchedFieldIds: (member.conditions ?? []).filter(condition => !workflowConditionsMatch([condition], values)).map(condition => condition.fieldId)
  }))
  const route = { ...definition, members: definition.members.filter(member => decisions.some(decision => decision.memberId === member.memberId && decision.eligible)) }
  if (!route.members.length) throw new WorkflowRouteValidationError('Workflow route is empty')
  if (route.purpose === 'approval_submission' && !route.members.some(member => member.kind === 'approval_template'
    || member.recommendationPlan?.finalApproval || member.recommendationPlan?.members.some(candidate => candidate.approval))) {
    throw new WorkflowRouteValidationError('Workflow route requires approval')
  }
  if (route.riskRatingEffect && !route.members.some(member => member.memberId === route.riskRatingEffect!.workflowMemberId)) {
    throw new WorkflowRouteValidationError('Workflow route requires its risk assessment')
  }
  const statusIds = [...new Set([
    ...route.allowedStartStatuses, route.cancellationStatus, route.executionFailureStatus,
    ...route.members.flatMap(member => [member.materializationStatus, member.successStatus, member.failureStatus].filter((id): id is string => Boolean(id)))
  ])].sort()
  const statuses = await trx.selectFrom('Common_Status').select(['id', 'egcs_cn_terminal'])
    .where('id', 'in', statusIds).where('_deleted', '=', false).orderBy('id').forUpdate().execute()
  try {
    validatePublishedWorkflowStatusGraph(route, new Map(statuses.map(status => [String(status.id), { id: String(status.id), terminal: status.egcs_cn_terminal }])))
  } catch (error) {
    throw new WorkflowRouteValidationError(error instanceof Error ? error.message : 'Invalid workflow route', { cause: error })
  }
  const evidence = { agreementId, values, decisions, fields: capturedFields }
  return { ...evidence, hash: createHash('sha256').update(JSON.stringify(evidence)).digest('hex') }
}
