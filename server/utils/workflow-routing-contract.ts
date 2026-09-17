import type { AgreementRoutingValues, AgreementCustomFieldValues } from '~~/shared/types/schemas/agreement-custom-fields'

/** An invalid selected route must be rejected before a runtime is created. */
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

/** Values and labels captured under the workflow write transaction, before evaluation. */
export type WorkflowRoutingSnapshot = Pick<WorkflowRoutingEvidence, 'agreementId' | 'values' | 'fields' | 'profile' | 'relationships'>

export type WorkflowRoutingDecisions = WorkflowRoutingEvidence['decisions']
