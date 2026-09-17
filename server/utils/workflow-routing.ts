import { createHash } from 'node:crypto'
/* eslint-disable jsdoc/require-jsdoc -- Captures Agreement-owned routing under the existing stream/Agreement lock order. */
import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { ReviewRuntimeEntityContext } from './review-runtime-access'
import { profileConditionLabels, readWorkflowProfileChoices } from './workflow-profile-conditions'
import { readAgreementCustomFieldDefinitions } from './agreement-custom-fields'
import { customFieldOptionIds, workflowConditionKey, workflowConditionsMatch, type AgreementRoutingValues, type AgreementCustomFieldValues } from '~~/shared/types/schemas/agreement-custom-fields'
import { validatePublishedWorkflowStatusGraph, type PublishedWorkflowConfiguration } from './workflow-setup-versioning'

export class WorkflowRouteValidationError extends Error {}

export type WorkflowRoutingEvidence = {
  version?: 2
  profile?: AgreementRoutingValues
  relationships?: Array<{ relationshipId: string, proponentId: string, subtypeId: string | null, name_en: string | null, name_fr: string | null }>
  hash: string
  fields: Array<{ fieldId: string, name_en: string, name_fr: string, optionId: string, option_en: string, option_fr: string }>
  agreementId: string | null
  values: AgreementCustomFieldValues
  decisions: Array<{ memberId: string, eligible: boolean, unmatchedFieldIds: string[], conditions?: Array<{ key: string, matched: boolean, name_en: string, name_fr: string, options: Array<{ id: string, name_en: string, name_fr: string }>, quantifier?: 'any' | 'all' }> }>
}
export const captureWorkflowRouting = async (
  trx: Transaction<Database>, context: ReviewRuntimeEntityContext, definition: PublishedWorkflowConfiguration
): Promise<WorkflowRoutingEvidence> => {
  const referencedIds = [...new Set(definition.members.flatMap(member => (member.conditions ?? []).flatMap(condition => 'fieldId' in condition ? [condition.fieldId] : [])))]
  const agreementId = context.entityType === 'fundingcaseagreement' ? context.entityId : context.agreementId ?? null
  const values: AgreementCustomFieldValues = {}
  const capturedFields: WorkflowRoutingEvidence['fields'] = []
  const profileConditions = definition.members.flatMap(member => (member.conditions ?? []).filter(condition => 'source' in condition))
  let profile: AgreementRoutingValues | undefined
  const relationships: NonNullable<WorkflowRoutingEvidence['relationships']> = []
  if (referencedIds.length || profileConditions.length) {
    if (!agreementId) throw new WorkflowRouteValidationError('Conditional workflow requires an owning Agreement')
    const agreement = await trx.selectFrom('Funding_Case_Agreement_Profile').select(['egcs_fc_customfields', 'egcs_fc_transferpaymentstream', 'egcs_fc_agreementsubtype', 'egcs_fc_holdbackbasis', 'egcs_fc_furtherdistribution'])
      .where('id', '=', agreementId).where('_deleted', '=', false).forUpdate().executeTakeFirstOrThrow()
    if (profileConditions.length) {
      const rows = await trx.selectFrom('Funding_Case_Agreement_Applicant_Recipient as r')
        .innerJoin('Applicant_Recipient_Profile as p', 'p.id', 'r.egcs_fc_applicantrecipient')
        .leftJoin('Agency_Applicant_Recipient_Subtype as t', 't.id', 'r.egcs_fc_applicantrecipientsubtype')
        .where('r.egcs_fc_fundingagreement', '=', agreementId).where('r._deleted', '=', false).where('p._deleted', '=', false)
        .select(['r.id', 'p.id as proponentId', 'r.egcs_fc_applicantrecipientsubtype as subtypeId', 't.egcs_ay_name_en as name_en', 't.egcs_ay_name_fr as name_fr'])
        .orderBy('p.id').orderBy('r.id').forShare(['p']).execute()
      relationships.push(...rows.map(row => ({ relationshipId: String(row.id), proponentId: String(row.proponentId), subtypeId: row.subtypeId === null ? null : String(row.subtypeId), name_en: row.name_en, name_fr: row.name_fr })))
      profile = { agreement_subtype: agreement.egcs_fc_agreementsubtype, holdback_basis: agreement.egcs_fc_holdbackbasis, further_distribution: agreement.egcs_fc_furtherdistribution, proponent_type: relationships.map(row => row.subtypeId) }
      const choices = await readWorkflowProfileChoices(trx, agreement.egcs_fc_transferpaymentstream)
      for (const source of new Set(profileConditions.map(condition => condition.source))) {
        const labels = profileConditionLabels[source]
        if (source === 'further_distribution') {
          capturedFields.push({ fieldId: source, ...labels, optionId: String(profile.further_distribution), option_en: profile.further_distribution ? 'Yes' : 'No', option_fr: profile.further_distribution ? 'Oui' : 'Non' })
        } else if (source === 'proponent_type') {
          for (const row of relationships) capturedFields.push({ fieldId: source, ...labels, optionId: row.relationshipId, option_en: row.name_en ?? 'Unclassified', option_fr: row.name_fr ?? 'Non classé' })
        } else {
          const option = choices[source].find(item => item.id === profile![source])
          if (option) capturedFields.push({ fieldId: source, ...labels, optionId: option.id, option_en: option.name_en, option_fr: option.name_fr })
        }
      }
    }
    const fields = await readAgreementCustomFieldDefinitions(trx, agreement.egcs_fc_transferpaymentstream)
    for (const fieldId of referencedIds) {
      const field = fields.find(candidate => candidate.id === fieldId)
      const value = customFieldOptionIds(agreement.egcs_fc_customfields[fieldId])
      if (!field || field.egcs_tp_kind !== 'relational' || !value.length || value.some(optionId => !field.options.some(option => option.id === optionId))) {
        throw new WorkflowRouteValidationError('Workflow discriminator value is missing or invalid')
      }
      values[fieldId] = value
      for (const optionId of value) {
        const option = field.options.find(candidate => candidate.id === optionId)!
        capturedFields.push({ fieldId, name_en: field.egcs_tp_name_en, name_fr: field.egcs_tp_name_fr, optionId, option_en: option.egcs_tp_name_en, option_fr: option.egcs_tp_name_fr })
      }
    }
  }
  const decisions = definition.members.map(member => ({
    memberId: member.memberId,
    eligible: workflowConditionsMatch(member.conditions ?? [], values, profile),
    unmatchedFieldIds: (member.conditions ?? []).filter(condition => !workflowConditionsMatch([condition], values, profile)).map(workflowConditionKey),
    conditions: (member.conditions ?? []).map(condition => ({ key: workflowConditionKey(condition), matched: workflowConditionsMatch([condition], values, profile), name_en: condition.name_en, name_fr: condition.name_fr, options: condition.options, ...('quantifier' in condition ? { quantifier: condition.quantifier } : {}) }))
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
  const evidence = { version: 2 as const, agreementId, values, decisions, fields: capturedFields, ...(profile ? { profile, relationships } : {}) }
  return { ...evidence, hash: createHash('sha256').update(JSON.stringify(evidence)).digest('hex') }
}
