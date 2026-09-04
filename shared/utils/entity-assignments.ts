import type { AssignableEntityType } from '../constants/enums'
import { ASSIGNABLE_ENTITY_TYPE_ENUM } from '../constants/enums'
import type { AuthorizationSubject } from './abilities'

export type AssignableEntityMetadata = {
  subject: AuthorizationSubject | 'resolved_owner'
  ownerResolver: 'applicant_recipient' | 'agreement' | 'agreement_parent' | 'agreement_claim_parent' | 'runtime_source'
  ownerColumn: string | null
  assignmentRoot: 'self'
  creationParent: 'lead_agency' | 'transfer_payment_stream' | 'agreement' | 'fundingcaseagreementclaim' | 'runtime_source'
  allowedScopes: readonly ('global' | 'agency' | 'program')[]
  table: string
  statusColumn: string | null
  agreementRouteSegment: string | null
  searchLabels: readonly string[]
}

export const ASSIGNED_WORK_ENGINE_STATUS_SEARCH_LABELS: Readonly<Record<string, readonly string[]>> = {
  active: ['Active', 'Actif'],
  paused: ['Paused', 'En pause']
}

export const ASSIGNABLE_ENGINE_OPEN_QUEUE_STATUSES = {
  commonreview: new Set(['active', 'paused']),
  commonrecommendation: new Set(['active', 'paused'])
} as const

/**
 * Creates lifecycle metadata for entity types whose action, roster, and queue states coincide.
 * @param policy Entity ownership, scope, and storage policy.
 * @param agreementRouteSegment Nested Agreement route segment, when applicable.
 * @param searchLabels English and French labels used by assigned-work search.
 * @returns Complete assignment lifecycle metadata.
 */
const createMetadata = (
  policy: Pick<AssignableEntityMetadata, 'subject' | 'ownerResolver' | 'ownerColumn' | 'creationParent' | 'allowedScopes' | 'table' | 'statusColumn'>,
  agreementRouteSegment: string | null,
  searchLabels: readonly string[]
): AssignableEntityMetadata => ({
  ...policy,
  assignmentRoot: 'self',
  agreementRouteSegment,
  searchLabels
})

const proponentPolicy = { subject: 'applicant_recipient', ownerResolver: 'applicant_recipient', ownerColumn: null, creationParent: 'lead_agency', allowedScopes: ['global', 'agency'], table: 'Applicant_Recipient_Profile', statusColumn: null } as const
const agreementPolicy = { subject: 'agreement', ownerResolver: 'agreement_parent', ownerColumn: 'egcs_fc_fundingagreement', creationParent: 'agreement', allowedScopes: ['global', 'agency', 'program'], statusColumn: 'egcs_fc_status' } as const

export const ENTITY_AUTHORIZATION_POLICIES = {
  applicantrecipient: createMetadata(proponentPolicy, null, ['Proponent', 'Bénéficiaire']),
  fundingcaseagreement: createMetadata({ ...agreementPolicy, ownerResolver: 'agreement', ownerColumn: null, creationParent: 'transfer_payment_stream', table: 'Funding_Case_Agreement_Profile' }, null, ['Agreement', 'Entente']),
  fundingcaseagreementcloseout: createMetadata({ ...agreementPolicy, table: 'Funding_Case_Agreement_Closeout' }, 'closeouts', ['Closeout', 'Clôture']),
  commonreview: createMetadata({ subject: 'resolved_owner', ownerResolver: 'runtime_source', ownerColumn: null, creationParent: 'runtime_source', allowedScopes: ['global', 'agency', 'program'], table: 'Common_Review', statusColumn: null }, null, ['Review', 'Examen']),
  commonrecommendation: createMetadata({ subject: 'resolved_owner', ownerResolver: 'runtime_source', ownerColumn: null, creationParent: 'runtime_source', allowedScopes: ['global', 'agency', 'program'], table: 'Common_Recommendation', statusColumn: null }, null, ['Recommendation', 'Recommandation']),
  fundingcaseagreementclaim: createMetadata({ ...agreementPolicy, table: 'Funding_Case_Agreement_Claim' }, 'claims', ['Claim', 'Réclamation']),
  fundingclaimreconcile: createMetadata({ ...agreementPolicy, ownerResolver: 'agreement_claim_parent', ownerColumn: 'egcs_fc_fundingagreementclaim', creationParent: 'fundingcaseagreementclaim', table: 'Funding_Case_Agreement_Claim_Reconcile' }, null, ['Claim reconciliation', 'Rapprochement de réclamation']),
  fundingcasepayment: createMetadata({ ...agreementPolicy, table: 'Funding_Case_Agreement_Payment' }, 'payments', ['Payment', 'Paiement']),
  fundingcaseforecast: createMetadata({ ...agreementPolicy, table: 'Funding_Case_Agreement_Forecast' }, 'forecasts', ['Forecast', 'Prévision']),
  fundingcasemonitor: createMetadata({ ...agreementPolicy, table: 'Funding_Case_Agreement_Monitor' }, 'monitors', ['Monitor', 'Surveillance']),
  fundingcaseamendment: createMetadata({ ...agreementPolicy, table: 'Funding_Case_Agreement_Amendment' }, 'amendments', ['Amendment', 'Modification']),
  fundingcaseagreementcommitment: createMetadata({ ...agreementPolicy, table: 'Funding_Case_Agreement_Commitment' }, 'commitments', ['Commitment', 'Engagement'])
} as const satisfies Record<AssignableEntityType, AssignableEntityMetadata>

export const isAssignableEntityType = (value: string): value is AssignableEntityType =>
  ASSIGNABLE_ENTITY_TYPE_ENUM.includes(value as AssignableEntityType)

/**
 * Builds the direct detail route for an assigned work item.
 * @param entityType Supported work-item type.
 * @param entityId Work-item identifier.
 * @param agreementId Owning Agreement identifier when its route is nested.
 * @param variant Optional runtime subtype used to select the correct detail surface.
 * @returns Direct localized-route-independent path.
 */
export const buildAssignedWorkRoute = (
  entityType: AssignableEntityType,
  entityId: string,
  agreementId: string | null,
  variant: string | null = null
): string => {
  if (entityType === 'commonreview') return variant === 'checklist' ? `/checklists/${entityId}` : `/assessments/${entityId}`
  if (entityType === 'applicantrecipient') return `/proponents/edit/${entityId}`
  if (entityType === 'fundingcaseagreement') return `/agreements/${entityId}`
  if (entityType === 'commonrecommendation') return `/recommendations/${entityId}`
  if (entityType === 'fundingclaimreconcile') return `/claim-reconciliations/${entityId}`
  const segment = ENTITY_AUTHORIZATION_POLICIES[entityType].agreementRouteSegment
  if (!segment || !agreementId) throw new Error(`Missing Agreement route context for ${entityType}`)
  return `/agreements/${agreementId}/${segment}/${entityId}`
}
