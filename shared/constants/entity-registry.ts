export type EntityCompletionCapability = 'supported' | 'none'
export type EntityApprovalSubmissionCapability = 'explicit' | 'on_completion' | 'none'
export type EntityStandardWorkflowCapability = 'explicit' | 'none'
export type EntityRiskRatingCapability = 'explicit' | 'none'
export type EntityWorkflowPurpose = 'standard' | 'approval_submission' | 'risk_rating'
export type EntityOwnerKind = 'agreement' | 'proponent' | 'runtime_source'
export type EntityAssignmentMode = 'independent' | 'inherited'

export interface EntityBilingualLabel {
  en: string
  fr: string
}

export type CoreEntityDefinition = {
  completion: EntityCompletionCapability
  approvalSubmission: EntityApprovalSubmissionCapability
  standardWorkflow: EntityStandardWorkflowCapability
  riskRating: EntityRiskRatingCapability
  label: EntityBilingualLabel
  supportsDirectReviews: boolean
  ownerKind: EntityOwnerKind | null
  assignmentMode: EntityAssignmentMode | null
  approvalSubmissionRequired?: true
  approvalSubmissionTerminalSuccess?: true
}

/**
 * Canonical code-side declaration for every built-in polymorphic entity type.
 *
 * A null transition mode is deliberate: structural configuration entities and
 * materialized Review/Recommendation evidence participate in polymorphic
 * identity without becoming business-transition roots. Funding Case Intake
 * remains non-lifecycle until its separate RBAC boundary and adapter contract
 * are implemented and confirmed.
 */
export const CORE_ENTITY_REGISTRY = {
  fundingopportunity: {
    label: { en: 'Funding Opportunity', fr: 'Possibilité de financement' },
    completion: 'none', approvalSubmission: 'none', standardWorkflow: 'none', riskRating: 'none',
    supportsDirectReviews: false,
    ownerKind: null,
    assignmentMode: null
  },
  fundingcaseagreement: {
    label: { en: 'Funding Case Agreement', fr: 'Entente de dossier de financement' },
    completion: 'none', approvalSubmission: 'explicit', standardWorkflow: 'explicit', riskRating: 'explicit',
    supportsDirectReviews: true,
    ownerKind: 'agreement',
    assignmentMode: 'independent'
  },
  fundingcaseagreementcloseout: {
    label: { en: 'Agreement Closeout', fr: 'Clôture d’entente' },
    completion: 'supported', approvalSubmission: 'on_completion', standardWorkflow: 'explicit', riskRating: 'none',
    supportsDirectReviews: true,
    ownerKind: 'agreement',
    assignmentMode: 'independent',
    approvalSubmissionRequired: true,
    approvalSubmissionTerminalSuccess: true
  },
  applicantrecipient: {
    label: { en: 'Proponent', fr: 'Promoteur' },
    completion: 'none', approvalSubmission: 'none', standardWorkflow: 'none', riskRating: 'none',
    supportsDirectReviews: true,
    ownerKind: 'proponent',
    assignmentMode: 'independent'
  },
  transferpaymentstream: {
    label: { en: 'Transfer Payment Stream', fr: 'Volet de paiement de transfert' },
    completion: 'none', approvalSubmission: 'none', standardWorkflow: 'none', riskRating: 'none',
    supportsDirectReviews: false,
    ownerKind: null,
    assignmentMode: null
  },
  commonreview: {
    label: { en: 'Common Review', fr: 'Examen commun' },
    completion: 'none', approvalSubmission: 'none', standardWorkflow: 'none', riskRating: 'none',
    supportsDirectReviews: false,
    ownerKind: 'runtime_source',
    assignmentMode: 'independent'
  },
  commonrecommendation: {
    label: { en: 'Common Recommendation', fr: 'Recommandation commune' },
    completion: 'none', approvalSubmission: 'none', standardWorkflow: 'none', riskRating: 'none',
    supportsDirectReviews: false,
    ownerKind: 'runtime_source',
    assignmentMode: 'independent'
  },
  fundingcaseintake: {
    label: { en: 'Funding Case Intake', fr: 'Réception du dossier de financement' },
    completion: 'none', approvalSubmission: 'none', standardWorkflow: 'none', riskRating: 'none',
    supportsDirectReviews: true,
    ownerKind: null,
    assignmentMode: null
  },
  fundingcaseagreementclaim: {
    label: { en: 'Agreement Claim', fr: 'Réclamation d’entente' },
    completion: 'supported', approvalSubmission: 'on_completion', standardWorkflow: 'explicit', riskRating: 'none',
    supportsDirectReviews: true,
    ownerKind: 'agreement',
    assignmentMode: 'independent'
  },
  fundingcaseamendment: {
    label: { en: 'Funding Case Amendment', fr: 'Modification du dossier de financement' },
    completion: 'supported', approvalSubmission: 'on_completion', standardWorkflow: 'explicit', riskRating: 'none',
    supportsDirectReviews: true,
    ownerKind: 'agreement',
    assignmentMode: 'independent',
    approvalSubmissionRequired: true,
    approvalSubmissionTerminalSuccess: true
  },
  fundingcasemonitor: {
    label: { en: 'Funding Case Monitor', fr: 'Suivi du dossier de financement' },
    completion: 'supported', approvalSubmission: 'on_completion', standardWorkflow: 'explicit', riskRating: 'none',
    supportsDirectReviews: true,
    ownerKind: 'agreement',
    assignmentMode: 'independent'
  },
  fundingclaimreconcile: {
    label: { en: 'Funding Claim Reconciliation', fr: 'Rapprochement de réclamation de financement' },
    completion: 'supported', approvalSubmission: 'on_completion', standardWorkflow: 'explicit', riskRating: 'none',
    supportsDirectReviews: true,
    ownerKind: 'agreement',
    assignmentMode: 'independent'
  },
  fundingcaseforecast: {
    label: { en: 'Funding Case Forecast', fr: 'Prévision du dossier de financement' },
    completion: 'supported', approvalSubmission: 'on_completion', standardWorkflow: 'explicit', riskRating: 'none',
    supportsDirectReviews: true,
    ownerKind: 'agreement',
    assignmentMode: 'independent'
  },
  fundingcasepayment: {
    label: { en: 'Funding Case Payment', fr: 'Paiement du dossier de financement' },
    completion: 'supported', approvalSubmission: 'on_completion', standardWorkflow: 'explicit', riskRating: 'none',
    supportsDirectReviews: true,
    ownerKind: 'agreement',
    assignmentMode: 'independent'
  },
  fundingcaserecommendation: {
    label: { en: 'Funding Case Recommendation', fr: 'Recommandation du dossier de financement' },
    completion: 'none', approvalSubmission: 'none', standardWorkflow: 'none', riskRating: 'none',
    supportsDirectReviews: true,
    ownerKind: 'agreement',
    assignmentMode: null
  },
  fundingcaseagreementcommitment: {
    label: { en: 'Funding Case Agreement Commitment', fr: 'Engagement d’entente de dossier de financement' },
    completion: 'supported', approvalSubmission: 'on_completion', standardWorkflow: 'explicit', riskRating: 'none',
    supportsDirectReviews: true,
    ownerKind: 'agreement',
    assignmentMode: 'independent'
  }
} as const satisfies Record<string, CoreEntityDefinition>

export type CoreEntityType = keyof typeof CORE_ENTITY_REGISTRY

type CoreEntityTypeMatching<
  Key extends keyof CoreEntityDefinition,
  Value
> = {
  [EntityType in CoreEntityType]: (typeof CORE_ENTITY_REGISTRY)[EntityType] extends Record<Key, Value>
    ? EntityType
    : never
}[CoreEntityType]

export type CoreLifecycleEntityType = CoreEntityTypeMatching<'standardWorkflow', 'explicit'>
type CoreCompletionWorkflowEntityType = CoreEntityTypeMatching<'completion', 'supported'>
type CoreCompletionEntityType = CoreCompletionWorkflowEntityType | 'commonreview'
type CoreDirectReviewEntityType = CoreEntityTypeMatching<'supportsDirectReviews', true>
type CoreAssignableEntityType = CoreEntityTypeMatching<'assignmentMode', EntityAssignmentMode>

type NonEmptyReadonlyArray<Value extends string> = readonly [Value, ...Value[]]

/**
 * Derives a frozen, non-empty entity-type list from the canonical registry.
 * @param predicate Capability predicate applied to each core declaration.
 * @returns Matching core entity types in canonical registry order.
 */
const deriveCoreEntityTypes = <Value extends CoreEntityType>(
  predicate: (definition: CoreEntityDefinition) => boolean
): NonEmptyReadonlyArray<Value> => Object.freeze(
  Object.entries(CORE_ENTITY_REGISTRY)
    .filter(([, definition]) => predicate(definition))
    .map(([entityType]) => entityType)
) as unknown as NonEmptyReadonlyArray<Value>

export const CORE_ENTITY_TYPE_ENUM = Object.freeze(
  Object.keys(CORE_ENTITY_REGISTRY)
) as NonEmptyReadonlyArray<CoreEntityType>

export const CORE_LIFECYCLE_ENTITY_TYPE_ENUM = deriveCoreEntityTypes<CoreLifecycleEntityType>(
  definition => definition.standardWorkflow === 'explicit'
)

export const CORE_COMPLETION_WORKFLOW_ENTITY_TYPE_ENUM = deriveCoreEntityTypes<CoreCompletionWorkflowEntityType>(
  definition => definition.completion === 'supported'
)

/** Reviews retain not_applicable Completion evidence without becoming business-transition roots. */
export const CORE_COMPLETION_ENTITY_TYPE_ENUM = Object.freeze([
  'commonreview',
  ...CORE_COMPLETION_WORKFLOW_ENTITY_TYPE_ENUM
]) as NonEmptyReadonlyArray<CoreCompletionEntityType>

export const CORE_DIRECT_REVIEW_ENTITY_TYPE_ENUM = deriveCoreEntityTypes<CoreDirectReviewEntityType>(
  definition => definition.supportsDirectReviews
)

export const CORE_ASSIGNABLE_ENTITY_TYPE_ENUM = deriveCoreEntityTypes<CoreAssignableEntityType>(
  definition => definition.assignmentMode !== null
)

export const CORE_ENTITY_DEFINITIONS = Object.freeze(
  Object.entries(CORE_ENTITY_REGISTRY).map(([type, definition]) => ({
    type: type as CoreEntityType,
    ...definition
  }))
)

export const isCoreEntityType = (value: string): value is CoreEntityType =>
  Object.hasOwn(CORE_ENTITY_REGISTRY, value)

export const getCoreEntityDefinition = (entityType: CoreEntityType): CoreEntityDefinition =>
  CORE_ENTITY_REGISTRY[entityType]

export const requiresApprovalSubmissionAtCompletion = (entityType: CoreEntityType): boolean =>
  getCoreEntityDefinition(entityType).approvalSubmissionRequired === true

/**
 * Whether successful approval submission must leave this core entity terminal.
 * @param entityType - Core entity type whose lifecycle contract is being inspected.
 * @returns True when a successful approval-submission workflow must produce a terminal status.
 */
export const requiresTerminalApprovalSubmissionSuccess = (entityType: CoreEntityType): boolean =>
  getCoreEntityDefinition(entityType).approvalSubmissionTerminalSuccess === true
