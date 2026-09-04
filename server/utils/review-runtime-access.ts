/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Review authorization helpers expose typed internal contracts covered by focused regression tests. */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import { canReadExactRuntimeItem, type ExactEntityTarget } from '@gcs-ssc/authorization'
import { resolveApprovalItemGrant } from '@gcs-ssc/authorization/server'
import { badRequest, forbidden, notFound, throwApiError } from '~~/server/utils/api-errors'
import { canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import {
  canAccessApplicantRecipient,
  executeFreshAuthorizedApplicantRecipientWrite
} from '~~/server/utils/applicant-recipient-auth'
import { authorize, authorizeAssignedItem, authorizeFreshAssignedItem, authorizeWithFreshAuthContext, requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import type { AuthContext } from '~~/server/utils/authorize'
import type { Database, Entity_Type } from '~~/shared/types/database'
import { resolveAgreementAmendmentRuntimeContext } from '~~/server/utils/agreement-amendment'
import { resolveAgreementClaimReconcileRuntimeContext, resolveAgreementClaimRuntimeContext } from '~~/server/utils/agreement-claim'
import { resolveAgreementCommitmentRuntimeContext } from '~~/server/utils/agreement-commitment'
import { resolveAgreementForecastRuntimeContext } from '~~/server/utils/agreement-forecast'
import { resolveAgreementMonitorRuntimeContext } from '~~/server/utils/agreement-monitor'
import { resolveAgreementPaymentRuntimeContext } from '~~/server/utils/agreement-payment'
import { resolveAgreementCloseoutRuntimeContext } from '~~/server/utils/agreement-closeout'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import type { ReviewRuntimeSetupScope } from '~~/server/utils/review-runtime'
import { isAssignableEntityType } from '~~/shared/utils/entity-assignments'
import { resolveAssignedItemGrant } from '~~/server/utils/rbac'
import { canManageEntityAssignmentsWithContext } from '~~/server/utils/entity-assignment'
import { isBusinessStatusEntityType, isBusinessStatusLineageLocked } from '~~/server/utils/business-status-runtime'
import { getCoreEntityDefinition, isCoreEntityType } from '~~/shared/constants/entity-registry'
import { resolveEntityTypeLifecycleDefinition } from '~~/server/utils/entity-type-registry'
import {
  resolveExtensionLifecycleRuntimeInTransaction,
  type ResolvedExtensionLifecycleRuntime
} from '~~/server/utils/extension-lifecycle-context'
import {
  authorizeQualifiedRuntimeMutation,
  executeQualifiedRuntimeTransaction,
  resolveQualifiedRuntimeTransactionPlan,
  type QualifiedRuntimeLockEvidence
} from '~~/server/utils/qualified-runtime-transaction'

export type ReviewRuntimeAction =
  | 'list_review_sets'
  | 'lookup_review_setups'
  | 'create_review_set'
  | 'cancel_review_set'
  | 'clone_review'
  | 'read_assessment'
  | 'save_assessment'
  | 'delete_assessment_child'
  | 'read_review_approval'
  | 'action_review_approval'
  | 'manage_review_approval'

export type ReviewRuntimeEntityContext = {
  entityType: Entity_Type
  entityId: string
  agreementId?: string | null
  applicantRecipientLeadAgencyId: string | null
  schemaAgencyId: string | null
  reviewSetId: string | null
  reviewId?: string | null
  approvalEntityType?: Entity_Type | null
  approvalEntityId?: string | null
  setupScopes?: ReviewRuntimeSetupScope[]
  isOpen?: boolean
}

/** Projects whether engine-owned runtime work is allowed by the complete current business-status lineage. */
export const isReviewRuntimeEntityWorkable = async (
  db: Kysely<Database>,
  context: ReviewRuntimeEntityContext
): Promise<boolean> => !isBusinessStatusEntityType(context.entityType)
  || !await isBusinessStatusLineageLocked(db, context.entityType, context.entityId)

/** Resolves the owning agency used to constrain review setup selection and creation. */
export const getReviewRuntimeOwnerAgencyId = (
  entityContext: ReviewRuntimeEntityContext
): string | null => entityContext.entityType === 'applicantrecipient'
  ? entityContext.applicantRecipientLeadAgencyId
  : entityContext.schemaAgencyId

/**
 * Resolves the exact entity and active stream scopes where a review setup may apply.
 *
 * Proponent stream scopes require an active Agreement link in the Proponent's lead agency.
 * Agreement-owned children inherit only their exact Agreement and current active stream. Write
 * callers lock the complete ownership graph so a concurrent relink cannot change applicability
 * between validation and review-set materialization.
 *
 * @param db - Database connection used to resolve the ownership graph.
 * @param entityContext - Fresh runtime entity context.
 * @param lockRows - Whether to lock every matched ownership row for a protected write.
 * @returns Exact setup scopes that are currently applicable to the runtime entity.
 */
export const resolveReviewRuntimeSetupScopes = async (
  db: Kysely<Database>,
  entityContext: ReviewRuntimeEntityContext,
  lockRows = false
): Promise<ReviewRuntimeSetupScope[]> => {
  if (entityContext.setupScopes) return entityContext.setupScopes
  if (entityContext.entityType === 'applicantrecipient') {
    if (!entityContext.applicantRecipientLeadAgencyId) return []

    let linkedStreamsQuery = db
      .selectFrom('Funding_Case_Agreement_Applicant_Recipient')
      .innerJoin(
        'Funding_Case_Agreement_Profile',
        'Funding_Case_Agreement_Profile.id',
        'Funding_Case_Agreement_Applicant_Recipient.egcs_fc_fundingagreement'
      )
      .innerJoin(
        'Transfer_Payment_Stream',
        'Transfer_Payment_Stream.id',
        'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream'
      )
      .innerJoin(
        'Transfer_Payment_Profile',
        'Transfer_Payment_Profile.id',
        'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
      )
      .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
      .select('Transfer_Payment_Stream.id as stream_id')
      .where('Funding_Case_Agreement_Applicant_Recipient.egcs_fc_applicantrecipient', '=', entityContext.entityId)
      .where('Transfer_Payment_Profile.egcs_tp_agency', '=', entityContext.applicantRecipientLeadAgencyId)
      .where('Funding_Case_Agreement_Applicant_Recipient._deleted', '=', false)
      .where('Funding_Case_Agreement_Profile._deleted', '=', false)
      .where('Transfer_Payment_Stream._deleted', '=', false)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .where('Agency_Profile._deleted', '=', false)
      .orderBy('Funding_Case_Agreement_Applicant_Recipient.id', 'asc')

    if (lockRows) linkedStreamsQuery = linkedStreamsQuery.forUpdate()
    const linkedStreams = await linkedStreamsQuery.execute()
    const streamIds = [...new Set(linkedStreams.map(row => String(row.stream_id)))]

    return [
      { scopeType: 'applicantrecipient', scopeId: entityContext.entityId },
      ...streamIds.map(scopeId => ({ scopeType: 'transferpaymentstream' as const, scopeId }))
    ]
  }

  if (!entityContext.agreementId || !entityContext.schemaAgencyId) return []

  let agreementQuery = db
    .selectFrom('Funding_Case_Agreement_Profile')
    .innerJoin(
      'Transfer_Payment_Stream',
      'Transfer_Payment_Stream.id',
      'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream'
    )
    .innerJoin(
      'Transfer_Payment_Profile',
      'Transfer_Payment_Profile.id',
      'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
    )
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .select('Transfer_Payment_Stream.id as stream_id')
    .where('Funding_Case_Agreement_Profile.id', '=', entityContext.agreementId)
    .where('Transfer_Payment_Profile.egcs_tp_agency', '=', entityContext.schemaAgencyId)
    .where('Funding_Case_Agreement_Profile._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)

  if (lockRows) agreementQuery = agreementQuery.forUpdate()
  const agreement = await agreementQuery.executeTakeFirst()
  if (!agreement) return []

  return [
    { scopeType: 'fundingcaseagreement', scopeId: entityContext.agreementId },
    { scopeType: 'transferpaymentstream', scopeId: String(agreement.stream_id) }
  ]
}

type ApprovalTarget = {
  entityId: string | null | undefined
  entityType: Entity_Type
}

const reviewRuntimeActionAliases: Partial<Record<ReviewRuntimeAction, ReviewRuntimeAction>> = {
  read_review_approval: 'read_assessment',
  manage_review_approval: 'save_assessment'
}

/** Reads the status code shape used by H3 errors without assuming a concrete error class. */
const getErrorStatusCode = (error: unknown): number | null => {
  return typeof error === 'object' && error !== null && 'statusCode' in error
    ? Number((error as { statusCode?: unknown }).statusCode)
    : null
}

const agreementReviewRuntimeEntityTypes = new Set<Entity_Type>([
  'fundingcaseagreement',
  'fundingcaseagreementcloseout',
  'fundingcaseagreementclaim',
  'fundingcaseamendment',
  'fundingcaseagreementcommitment',
  'fundingcaseforecast',
  'fundingcasemonitor',
  'fundingcasepayment',
  'fundingclaimreconcile'
])

/**
 * Resolves the approval entity used by direct approval actions.
 *
 * @param entityContext - Runtime entity context resolved for the route.
 * @returns The routing-slip entity target to check for assigned approval.
 */
const getApprovalActionFallbackTarget = (
  entityContext: ReviewRuntimeEntityContext
): ApprovalTarget => ({
  entityId: entityContext.approvalEntityId ?? entityContext.reviewId ?? entityContext.entityId,
  entityType: entityContext.approvalEntityType ?? (entityContext.reviewId ? 'commonreview' : entityContext.entityType)
})

/**
 * Checks whether the authenticated user is the assigned approver on any runtime approval row for the review.
 *
 * @param event - Active H3 event.
 * @param entityId - Runtime entity identifier when the request is approval-scoped.
 * @param entityType - Runtime entity type attached to the approval routing slip.
 * @returns True when the current user is assigned to a review approval.
 */
const hasAssignedApproval = async (
  db: Kysely<Database> | Transaction<Database>,
  currentCommonUserId: string,
  entityId: string | null | undefined,
  entityType: Entity_Type = 'commonreview',
  options: { lock?: boolean } = {}
): Promise<boolean> => {
  if (!entityId) {
    return false
  }

  let query = db
    .selectFrom('Common_Approval')
    .innerJoin('Common_Routing_Slip', 'Common_Routing_Slip.id', 'Common_Approval.egcs_cn_routingslip')
    .select('Common_Approval.id')
    .where('Common_Routing_Slip.egcs_cn_entitytype', '=', entityType)
    .where('Common_Routing_Slip.egcs_cn_entityid', '=', entityId)
    .where('Common_Routing_Slip._deleted', '=', false)
    .where(eb => eb.or([
      eb('Common_Approval.egcs_cn_assigneduser', '=', currentCommonUserId),
      eb.and([
        eb('Common_Approval.egcs_cn_assigneduser', 'is', null),
        eb('Common_Approval.egcs_cn_defaultuser', '=', currentCommonUserId)
      ])
    ]))
  if (options.lock) query = query.forUpdate('Common_Approval')
  const assignedApproval = await query.executeTakeFirst()

  return Boolean(assignedApproval)
}

const canReadAssignedApproval = async (
  event: H3Event,
  entityId: string | null | undefined,
  entityType: Entity_Type = 'commonreview'
): Promise<boolean> => {
  if (!entityId) {
    return false
  }

  const authContext = await requireAuthContext(event)
  return await resolveApprovalItemGrant(
    authContext.userId,
    { entityType, entityId },
    event.context.$db
  ) !== null
}

/**
 * Authorizes direct approval actions for the assigned approver only.
 *
 * @param event - Active H3 event.
 * @param entityContext - Runtime entity context resolved for the route.
 * @returns The authenticated authorization context when the user is assigned.
 */
const authorizeAssignedApprovalAction = async (
  event: H3Event,
  entityContext: ReviewRuntimeEntityContext
): Promise<AuthContext> => {
  const authContext = await requireAuthContext(event)
  const approvalTarget = getApprovalActionFallbackTarget(entityContext)
  if (await canReadAssignedApproval(event, approvalTarget.entityId, approvalTarget.entityType)) {
    return authContext
  }

  return await forbidden(event)
}

/**
 * Applies applicant-recipient runtime review authorization rules.
 *
 * @param event - Active H3 event.
 * @param action - Normalized review runtime action.
 * @param entityContext - Runtime entity context resolved for the route.
 * @returns The authenticated authorization context when allowed.
 */
const authorizeApplicantRecipientRuntimeAction = async (
  event: H3Event,
  action: ReviewRuntimeAction,
  entityContext: ReviewRuntimeEntityContext
): Promise<AuthContext> => {
  const db = event.context.$db

  if (action === 'list_review_sets') {
    return await authorize(event, 'applicant_recipient', 'read', async ({ context }) => {
      const canRead = await canAccessApplicantRecipient(context, entityContext.entityId, 'read', db)
      return canRead ? { bypass: true } : { denied: true }
    })
  }

  if (action === 'read_assessment') {
    return await authorize(event, 'applicant_recipient', 'read', async ({ context }) => {
      const canRead = await canAccessApplicantRecipient(context, entityContext.entityId, 'read', db)
      return canRead ? { bypass: true } : { denied: true }
    })
  }

  const entityAction = action === 'delete_assessment_child' ? 'delete' : 'update'
  return await authorize(event, 'applicant_recipient', entityAction, async ({ context }) => {
    const canAccess = await canAccessApplicantRecipient(context, entityContext.entityId, entityAction, db)
    return canAccess ? { bypass: true } : { denied: true }
  })
}

/** Applies only the Proponent owner's role ceiling without requiring a parent assignment. */
const authorizeApplicantRecipientOwnerRole = async (
  event: H3Event,
  action: ReviewRuntimeAction,
  entityContext: ReviewRuntimeEntityContext
): Promise<AuthContext> => {
  if (!entityContext.applicantRecipientLeadAgencyId) {
    return await forbidden(event)
  }

  const entityAction = action === 'delete_assessment_child' ? 'delete' : 'update'
  return await authorize(event, 'applicant_recipient', entityAction, {
    type: 'agency',
    agencyId: entityContext.applicantRecipientLeadAgencyId
  })
}

/**
 * Applies exact Agreement access to reviews owned by an Agreement-domain child.
 *
 * @param event - Active H3 event.
 * @param action - Normalized review runtime action.
 * @param entityContext - Runtime context carrying the owning Agreement id.
 * @returns The authenticated authorization context when allowed.
 */
const authorizeAgreementRuntimeAction = async (
  event: H3Event,
  action: ReviewRuntimeAction,
  entityContext: ReviewRuntimeEntityContext
): Promise<AuthContext> => {
  if (!entityContext.agreementId) {
    return await forbidden(event)
  }

  const agreementContext = await resolveAgreementScopeContext(entityContext.agreementId, event.context.$db)
  if (!agreementContext) {
    return await forbidden(event)
  }

  const agreementAction = action === 'list_review_sets' || action === 'read_assessment'
    ? 'read'
    : action === 'delete_assessment_child'
      ? 'delete'
      : 'update'

  return await authorize(event, 'agreement', agreementAction, async ({ context }) => {
    if (context.userAbilities.authorize('agreement', agreementAction, agreementContext.scope)) {
      return { bypass: true }
    }
    return { denied: true }
  })
}

/**
 * Applies schema-agency read/update authorization for non-applicant runtime reviews.
 *
 * @param event - Active H3 event.
 * @param action - Normalized review runtime action.
 * @param entityContext - Runtime entity context resolved for the route.
 * @returns The authorization context when the schema-agency rule applies.
 */
const authorizeSchemaAgencyRuntimeAction = async (
  event: H3Event,
  action: ReviewRuntimeAction,
  entityContext: ReviewRuntimeEntityContext
): Promise<AuthContext | null> => {
  if (action === 'read_assessment' && entityContext.schemaAgencyId) {
    return await authorize(event, 'agency', 'read', { type: 'agency', agencyId: entityContext.schemaAgencyId })
  }

  if ((action === 'save_assessment' || action === 'delete_assessment_child') && entityContext.schemaAgencyId) {
    const entityAction = action === 'delete_assessment_child' ? 'delete' : 'update'
    return await authorize(event, 'agency', entityAction, { type: 'agency', agencyId: entityContext.schemaAgencyId })
  }

  return null
}

/** Resolves the exact artifact whose direct assignment or approval grants runtime read access. */
const getReviewRuntimeReadTarget = (
  entityContext: ReviewRuntimeEntityContext
): ExactEntityTarget<Entity_Type> => {
  if (entityContext.approvalEntityType && entityContext.approvalEntityId) {
    return {
      entityType: entityContext.approvalEntityType,
      entityId: entityContext.approvalEntityId
    }
  }
  if (entityContext.reviewId) {
    return { entityType: 'commonreview', entityId: entityContext.reviewId }
  }
  return { entityType: entityContext.entityType, entityId: entityContext.entityId }
}

/** Identifies Review and Recommendation work assigned independently from its Proponent parent. */
const isIndependentProponentReviewTarget = (
  entityContext: ReviewRuntimeEntityContext,
  target: ExactEntityTarget<Entity_Type>
): boolean => entityContext.entityType === 'applicantrecipient'
  && (target.entityType === 'commonreview' || target.entityType === 'commonrecommendation')

const resolveExtensionAuthorizationRuntime = async (
  event: H3Event,
  entityContext: ReviewRuntimeEntityContext
): Promise<ResolvedExtensionLifecycleRuntime | null> => {
  if (!entityContext.entityType?.includes(':')) return null
  const actor = await resolveCurrentCommonUser(event)
  if (!actor) return null
  return await event.context.$db.transaction().execute(async trx =>
    await resolveExtensionLifecycleRuntimeInTransaction(
      trx,
      entityContext.entityType,
      entityContext.entityId,
      actor.id,
      event
    ))
}

const authorizeExtensionOwnerAction = async (
  event: H3Event,
  action: 'read' | 'update' | 'delete',
  runtime: ResolvedExtensionLifecycleRuntime
): Promise<AuthContext> => {
  const auth = await requireAuthContext(event)
  const owner = runtime.lockedEntity.owner
  const allowed = owner.owner === 'agreement'
    ? await (async () => {
        const agreement = await resolveAgreementScopeContext(owner.ownerId, event.context.$db)
        return agreement ? await canAccessAgreement(auth, action, agreement.scope, event.context.$db) : false
      })()
    : await canAccessApplicantRecipient(auth, owner.ownerId, action, event.context.$db)
  return allowed ? auth : await forbidden(event)
}

/** Requires inherited Viewer access or approval-specific read authority before workflow eligibility is considered. */
const authorizeReviewRuntimeReadAccess = async (
  event: H3Event,
  entityContext: ReviewRuntimeEntityContext
): Promise<AuthContext> => {
  const authContext = await requireAuthContext(event)
  const db = event.context.$db
  const extensionRuntime = await resolveExtensionAuthorizationRuntime(event, entityContext)
  const exactItemTarget = getReviewRuntimeReadTarget(entityContext)
  const exactItemAssignment = isAssignableEntityType(exactItemTarget.entityType)
    ? await resolveAssignedItemGrant(authContext.userId, exactItemTarget.entityType, exactItemTarget.entityId, db)
    : null
  const extensionAssignmentTarget = extensionRuntime
    ? extensionRuntime.loaded.definition.assignmentMode === 'independent'
      ? { entityType: entityContext.entityType, entityId: entityContext.entityId }
      : {
          entityType: extensionRuntime.lockedEntity.owner.owner === 'agreement'
            ? 'fundingcaseagreement' as const
            : 'applicantrecipient' as const,
          entityId: extensionRuntime.lockedEntity.owner.ownerId
        }
    : null
  const sourceAssignmentTarget = extensionAssignmentTarget
    ?? (isAssignableEntityType(entityContext.entityType)
      ? { entityType: entityContext.entityType, entityId: entityContext.entityId }
      : null)
  const sourceAssignment = sourceAssignmentTarget
    && (sourceAssignmentTarget.entityType !== exactItemTarget.entityType
      || sourceAssignmentTarget.entityId !== exactItemTarget.entityId)
    ? await resolveAssignedItemGrant(
        authContext.userId,
        sourceAssignmentTarget.entityType,
        sourceAssignmentTarget.entityId,
        db
      )
    : null
  const approvalAssignment = await resolveApprovalItemGrant(authContext.userId, exactItemTarget, db)
  let hasInheritedOwnerRead = false
  try {
    if (entityContext.entityType === 'applicantrecipient') {
      await authorizeApplicantRecipientRuntimeAction(event, 'read_assessment', entityContext)
      hasInheritedOwnerRead = true
    } else if (agreementReviewRuntimeEntityTypes.has(entityContext.entityType)) {
      await authorizeAgreementRuntimeAction(event, 'read_assessment', entityContext)
      hasInheritedOwnerRead = true
    } else if (extensionRuntime) {
      await authorizeExtensionOwnerAction(event, 'read', extensionRuntime)
      hasInheritedOwnerRead = true
    } else {
      const agencyContext = await authorizeSchemaAgencyRuntimeAction(event, 'read_assessment', entityContext)
      hasInheritedOwnerRead = agencyContext !== null
    }
  } catch (error: unknown) {
    if (getErrorStatusCode(error) !== 403) {
      throw error
    }
  }

  if (canReadExactRuntimeItem({
    hasInheritedOwnerRead,
    hasExactItemAssignment: exactItemAssignment !== null,
    hasExactSourceAssignment: sourceAssignment !== null,
    hasApprovalAssignment: approvalAssignment !== null
  })) {
    return authContext
  }

  return await forbidden(event)
}

const authorizeFreshReviewRuntimeReadAccess = async (
  event: H3Event,
  trx: Transaction<Database>,
  authContext: AuthContext,
  entityContext: ReviewRuntimeEntityContext
): Promise<void> => {
  const previousDb = event.context.$db
  const previousAuthContext = event.context.$authContext
  event.context.$db = trx
  event.context.$authContext = authContext
  try {
    await authorizeReviewRuntimeReadAccess(event, entityContext)
  } finally {
    event.context.$db = previousDb
    event.context.$authContext = previousAuthContext
  }
}

/**
 * Runtime review routes are generic at the URL layer, but authorization still resolves through
 * the entity that owns the runtime artifact. This helper keeps that boundary explicit so future
 * activities can reuse the entity lookup pattern without hiding review-specific rules.
 *
 * @param entityType - Runtime entity type supplied to a generic review-set collection route.
 * @returns True when the direct `entityType + entityId` route surface is implemented for the entity.
 */
export const isDirectReviewRuntimeEntitySupported = (entityType: Entity_Type): boolean =>
  isCoreEntityType(entityType) && getCoreEntityDefinition(entityType).supportsDirectReviews

const agreementRuntimeEntityResolvers = {
  fundingcaseagreement: {
    resolve: async (db: Kysely<Database>, agreementId: string) => {
      const context = await resolveAgreementScopeContext(agreementId, db)
      return context ? { ...context, agreementId, agreementEntityId: agreementId } : null
    },
    idKey: 'agreementEntityId'
  },
  fundingcaseagreementcloseout: {
    resolve: resolveAgreementCloseoutRuntimeContext,
    idKey: 'closeoutId'
  },
  fundingcaseagreementclaim: {
    resolve: resolveAgreementClaimRuntimeContext,
    idKey: 'claimId'
  },
  fundingcaseamendment: {
    resolve: resolveAgreementAmendmentRuntimeContext,
    idKey: 'amendmentId'
  },
  fundingcaseagreementcommitment: {
    resolve: resolveAgreementCommitmentRuntimeContext,
    idKey: 'commitmentId'
  },
  fundingcaseforecast: {
    resolve: resolveAgreementForecastRuntimeContext,
    idKey: 'forecastId'
  },
  fundingcasemonitor: {
    resolve: resolveAgreementMonitorRuntimeContext,
    idKey: 'monitorId'
  },
  fundingcasepayment: {
    resolve: resolveAgreementPaymentRuntimeContext,
    idKey: 'paymentId'
  },
  fundingclaimreconcile: {
    resolve: resolveAgreementClaimReconcileRuntimeContext,
    idKey: 'reconcileId'
  }
} as const

type AgreementRuntimeEntityType = keyof typeof agreementRuntimeEntityResolvers

/**
 * Checks whether a runtime entity type has a direct agreement-domain resolver.
 *
 * @param entityType - Candidate runtime entity type.
 * @returns True when the entity is backed by an agreement-domain resolver.
 */
const isAgreementRuntimeEntityType = (entityType: Entity_Type): entityType is AgreementRuntimeEntityType =>
  entityType in agreementRuntimeEntityResolvers

/**
 * Resolves the generic review runtime entity context for agreement-owned direct routes.
 *
 * @param db - Database connection used by the agreement-domain resolver.
 * @param entityType - Runtime entity type supplied by the route.
 * @param entityId - Runtime entity identifier supplied by the route.
 * @returns The normalized review runtime context, or null when unsupported or missing.
 */
const resolveAgreementReviewRuntimeEntity = async (
  db: Kysely<Database>,
  entityType: Entity_Type,
  entityId: string
): Promise<ReviewRuntimeEntityContext | null> => {
  if (!isAgreementRuntimeEntityType(entityType)) {
    return null
  }

  const resolver = agreementRuntimeEntityResolvers[entityType]
  const context = await resolver.resolve(db, entityId) as Record<string, unknown> | null
  if (!context || !context.agreementId) {
    return null
  }

  return {
    entityType,
    entityId: String(context[resolver.idKey]),
    agreementId: String(context.agreementId),
    applicantRecipientLeadAgencyId: null,
    schemaAgencyId: String(context.agencyId),
    reviewSetId: null,
    reviewId: null,
    ...(typeof context.isOpen === 'boolean' ? { isOpen: context.isOpen } : {})
  }
}

/**
 * Loads the runtime entity context from direct entity route input.
 *
 * The generic review-set collection routes accept `entityType + entityId`. Proponents resolve
 * directly, while supported Agreement-domain children retain their exact parent Agreement.
 *
 * @param db - Database connection used to resolve the owning entity.
 * @param entityType - Runtime entity type from the route query/body.
 * @param entityId - Runtime entity identifier from the route query/body.
 * @returns The resolved owning entity context when the entity exists and is supported.
 */
export const resolveReviewRuntimeEntityFromEntity = async (
  db: Kysely<Database>,
  entityType: Entity_Type,
  entityId: string
): Promise<ReviewRuntimeEntityContext | null> => {
  const agreementEntity = await resolveAgreementReviewRuntimeEntity(db, entityType, entityId)
  if (agreementEntity) return agreementEntity

  if (entityType?.includes(':')) {
    const identity = await db.selectFrom('Common_Entity').select('id')
      .where('id', '=', entityId)
      .where('egcs_cn_entitytype', '=', entityType)
      .where('_deleted', '=', false)
      .executeTakeFirst()
    return identity
      ? {
          entityType,
          entityId,
          agreementId: null,
          applicantRecipientLeadAgencyId: null,
          schemaAgencyId: null,
          reviewSetId: null,
          reviewId: null
        }
      : null
  }

  if (entityType !== 'applicantrecipient') {
    return null
  }

  const profile = await db
    .selectFrom('Applicant_Recipient_Profile')
    .select([
      'id',
      'egcs_ar_leadagency'
    ])
    .where('id', '=', entityId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  if (!profile) {
    return null
  }

  return {
    entityType,
    entityId: String(profile.id),
    agreementId: null,
    applicantRecipientLeadAgencyId: profile.egcs_ar_leadagency ? String(profile.egcs_ar_leadagency) : null,
    schemaAgencyId: null,
    reviewSetId: null,
    reviewId: null
  }
}

/**
 * Loads the owning runtime entity from a review set id.
 *
 * Cancel routes resolve from the runtime artifact first so the route stays review-specific instead
 * of nesting under an entity folder. Applicant-recipient metadata is joined inline because its
 * policy is the only entity-aware rule in this first pass.
 *
 * @param db - Database connection used to resolve the owning entity from the runtime review set.
 * @param reviewSetId - Runtime review-set identifier.
 * @returns The resolved owning entity context when the review set and attached entity are valid.
 */
export const resolveReviewRuntimeEntityFromReviewSet = async (
  db: Kysely<Database>,
  reviewSetId: string
): Promise<ReviewRuntimeEntityContext | null> => {
  const reviewSet = await db
    .selectFrom('Common_Review_Set')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Common_Runtime_Item.egcs_cn_runtime')
    .leftJoin('Applicant_Recipient_Profile', join => join
      .onRef('Applicant_Recipient_Profile.id', '=', 'Common_Review_Set.egcs_cn_entityid')
      .on('Common_Review_Set.egcs_cn_entitytype', '=', 'applicantrecipient')
      .on('Applicant_Recipient_Profile._deleted', '=', false))
    .select([
      'Common_Review_Set.egcs_cn_entitytype as entity_type',
      'Common_Review_Set.egcs_cn_entityid as entity_id',
      'Applicant_Recipient_Profile.id as applicant_recipient_id',
      'Applicant_Recipient_Profile.egcs_ar_leadagency as applicant_recipient_lead_agency'
    ])
    .where('Common_Review_Set.id', '=', reviewSetId)
    .where('Common_Review_Set._deleted', '=', false)
    .where('Common_Runtime_Item._deleted', '=', false)
    .where('Common_Runtime._deleted', '=', false)
    .executeTakeFirst()

  if (!reviewSet) {
    return null
  }

  if (reviewSet.entity_type === 'applicantrecipient' && !reviewSet.applicant_recipient_id) {
    return null
  }

  const agreementEntity = await resolveAgreementReviewRuntimeEntity(
    db,
    reviewSet.entity_type,
    String(reviewSet.entity_id)
  )
  if (isAgreementRuntimeEntityType(reviewSet.entity_type) && !agreementEntity) {
    return null
  }

  return {
    entityType: reviewSet.entity_type,
    entityId: String(reviewSet.entity_id),
    agreementId: agreementEntity?.agreementId ?? null,
    applicantRecipientLeadAgencyId: reviewSet.applicant_recipient_lead_agency
      ? String(reviewSet.applicant_recipient_lead_agency)
      : null,
    schemaAgencyId: null,
    reviewSetId,
    reviewId: null
  }
}

/** Resolves the owning entity and exact assignment target for a runtime Recommendation. */
export const resolveReviewRuntimeEntityFromRecommendation = async (
  db: Kysely<Database>,
  recommendationId: string
): Promise<ReviewRuntimeEntityContext | null> => {
  const recommendation = await db.selectFrom('Common_Recommendation')
    .select(['egcs_cn_entitytype', 'egcs_cn_entityid'])
    .where('id', '=', recommendationId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!recommendation) return null
  const owner = await resolveReviewRuntimeEntityFromEntity(
    db,
    recommendation.egcs_cn_entitytype,
    String(recommendation.egcs_cn_entityid)
  )
  if (!owner) return null
  return {
    ...owner,
    approvalEntityType: 'commonrecommendation',
    approvalEntityId: recommendationId
  }
}

/**
 * Loads the owning runtime entity from a review id.
 *
 * Assessment detail/save and review clone routes are children of a review row, so they resolve
 * their entity context from the review and its parent set instead of relying on entity-specific
 * URLs. The schema agency remains the policy input for entity types without an exact entity rule.
 *
 * @param db - Database connection used to resolve the owning entity from the runtime review row.
 * @param reviewId - Runtime review identifier.
 * @returns The resolved owning entity context when the review and attached entity are valid.
 */
export const resolveReviewRuntimeEntityFromReview = async (
  db: Kysely<Database>,
  reviewId: string
): Promise<ReviewRuntimeEntityContext | null> => {
  const review = await db
    .selectFrom('Common_Review')
    .innerJoin('Common_Review_Set', 'Common_Review_Set.id', 'Common_Review.egcs_cn_reviewset')
    .innerJoin('Common_Runtime_Item as Review_Item', 'Review_Item.id', 'Common_Review.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime_Item as Set_Item', 'Set_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Review_Item.egcs_cn_runtime')
    .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review.egcs_cn_reviewschema')
    .leftJoin('Applicant_Recipient_Profile', join => join
      .onRef('Applicant_Recipient_Profile.id', '=', 'Common_Review_Set.egcs_cn_entityid')
      .on('Common_Review_Set.egcs_cn_entitytype', '=', 'applicantrecipient')
      .on('Applicant_Recipient_Profile._deleted', '=', false))
    .select([
      'Common_Review_Set.egcs_cn_entitytype as entity_type',
      'Common_Review_Set.egcs_cn_entityid as entity_id',
      'Common_Review_Set.id as review_set_id',
      'Common_Review_Schema.egcs_cn_agency as schema_agency_id',
      'Applicant_Recipient_Profile.id as applicant_recipient_id',
      'Applicant_Recipient_Profile.egcs_ar_leadagency as applicant_recipient_lead_agency'
    ])
    .where('Common_Review.id', '=', reviewId)
    .where('Common_Review._deleted', '=', false)
    .where('Common_Review_Set._deleted', '=', false)
    .where('Review_Item._deleted', '=', false)
    .where('Set_Item._deleted', '=', false)
    .where('Common_Runtime._deleted', '=', false)
    .executeTakeFirst()

  if (!review) {
    return null
  }

  if (review.entity_type === 'applicantrecipient' && !review.applicant_recipient_id) {
    return null
  }

  const agreementEntity = await resolveAgreementReviewRuntimeEntity(
    db,
    review.entity_type,
    String(review.entity_id)
  )
  if (isAgreementRuntimeEntityType(review.entity_type) && !agreementEntity) {
    return null
  }

  return {
    entityType: review.entity_type,
    entityId: String(review.entity_id),
    agreementId: agreementEntity?.agreementId ?? null,
    applicantRecipientLeadAgencyId: review.applicant_recipient_lead_agency
      ? String(review.applicant_recipient_lead_agency)
      : null,
    schemaAgencyId: review.schema_agency_id ? String(review.schema_agency_id) : null,
    reviewSetId: String(review.review_set_id),
    reviewId
  }
}

/**
 * Returns the existing applicant-recipient not-found response for review runtime routes.
 *
 * The public routes are now generic, but applicant recipient is still the first implemented
 * entity. Reusing the existing error keeps the runtime cutover predictable for callers.
 *
 * @param event - Active H3 event.
 * @param entityType - Runtime entity type that failed to resolve.
 * @returns The not-found response for the requested runtime entity.
 */
export const respondReviewRuntimeEntityNotFound = async (
  event: H3Event,
  entityType: Entity_Type
) => {
  if (entityType === 'applicantrecipient') {
    return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
  }

  if (entityType === 'fundingcaseagreementcommitment') {
    return await notFound(event, 'AGREEMENT_COMMITMENT_NOT_FOUND', 'apiErrors.agreement.commitment_not_found')
  }

  if (entityType === 'fundingcaseagreementclaim') {
    return await notFound(event, 'AGREEMENT_CLAIM_NOT_FOUND', 'apiErrors.agreement.claim_not_found')
  }

  if (entityType === 'fundingcaseamendment') {
    return await notFound(event, 'AGREEMENT_AMENDMENT_NOT_FOUND', 'apiErrors.agreement.amendment_not_found')
  }

  if (entityType === 'fundingcaseforecast') {
    return await notFound(event, 'AGREEMENT_FORECAST_NOT_FOUND', 'apiErrors.agreement.forecast_not_found')
  }

  if (entityType === 'fundingcasemonitor') {
    return await notFound(event, 'AGREEMENT_MONITOR_NOT_FOUND', 'apiErrors.agreement.monitor_not_found')
  }

  if (entityType === 'fundingcasepayment') {
    return await notFound(event, 'AGREEMENT_PAYMENT_NOT_FOUND', 'apiErrors.agreement.payment_not_found')
  }

  if (entityType === 'fundingclaimreconcile') {
    return await notFound(event, 'AGREEMENT_CLAIM_RECONCILE_NOT_FOUND', 'apiErrors.agreement.claim_reconcile_not_found')
  }

  return await notFound(event, 'REVIEW_ENTITY_NOT_FOUND', 'apiErrors.admin_common.not_found')
}

/**
 * Rejects entity types that do not yet have a direct entity resolver for generic review-set routes.
 *
 * This keeps the route surface activity-specific and generic now, while making it obvious which
 * next step is required before another entity type can start using the same runtime endpoints.
 *
 * @param event - Active H3 event.
 * @param entityType - Runtime entity type requested by the caller.
 * @returns Undefined when supported, otherwise the bad-request response describing the unsupported type.
 */
export const assertDirectReviewRuntimeEntitySupported = async (
  event: H3Event,
  entityType: Entity_Type
) => {
  const definition = await resolveEntityTypeLifecycleDefinition(event.context.$db, entityType)
  if (definition?.supportsDirectReviews) {
    return
  }

  return await badRequest(event, 'UNSUPPORTED_REVIEW_ENTITY_TYPE', 'apiErrors.request.invalid')
}

/**
 * Applies review-specific authorization against the resolved owning entity.
 *
 * Reviews intentionally do not use a one-size-fits-all activity policy. The current rules are:
 * - reads -> inherited owner Viewer access or approval assignment
 * - writes on assignable sources and artifacts -> Contributor/Manager plus exact assignment to the work target
 * - Proponent writes use the same role-ceiling-plus-assignment contract
 * - approval actions -> exact approval assignment; approval side effects do not grant item assignment
 *
 * Owner access is read-only for assignable work. Other non-applicant assessment routes continue
 * to use their schema-agency policy until they become assignable work targets.
 *
 * @param event - Active H3 event.
 * @param action - Review runtime action being authorized.
 * @param entityContext - Owning entity metadata resolved from the route input or runtime artifact.
 * @returns The authenticated authorization context when the action is allowed.
 */
export const authorizeReviewRuntimeAction = async (
  event: H3Event,
  action: ReviewRuntimeAction,
  entityContext: ReviewRuntimeEntityContext
): Promise<AuthContext> => {
  const resolvedAction = reviewRuntimeActionAliases[action] ?? action
  const extensionRuntime = await resolveExtensionAuthorizationRuntime(event, entityContext)

  if (resolvedAction === 'read_assessment' || resolvedAction === 'list_review_sets') {
    return await authorizeReviewRuntimeReadAccess(event, entityContext)
  }

  if (resolvedAction === 'action_review_approval') {
    await authorizeReviewRuntimeReadAccess(event, entityContext)
    return await authorizeAssignedApprovalAction(event, entityContext)
  }

  const workTarget = getReviewRuntimeReadTarget(entityContext)
  if (isAssignableEntityType(workTarget.entityType)) {
    if (entityContext.entityType === 'applicantrecipient') {
      if (isIndependentProponentReviewTarget(entityContext, workTarget)) {
        await authorizeApplicantRecipientOwnerRole(event, resolvedAction, entityContext)
      } else {
        await authorizeApplicantRecipientRuntimeAction(event, resolvedAction, entityContext)
      }
    } else if (agreementReviewRuntimeEntityTypes.has(entityContext.entityType)) {
      await authorizeAgreementRuntimeAction(event, resolvedAction, entityContext)
    } else if (extensionRuntime) {
      await authorizeExtensionOwnerAction(
        event,
        resolvedAction === 'delete_assessment_child' ? 'delete' : 'update',
        extensionRuntime
      )
    } else {
      const agencyContext = await authorizeSchemaAgencyRuntimeAction(event, resolvedAction, entityContext)
      if (!agencyContext) return await forbidden(event)
    }
    return await authorizeAssignedItem(event, workTarget.entityType, workTarget.entityId)
  }

  if (entityContext.entityType === 'applicantrecipient') {
    return await authorizeApplicantRecipientRuntimeAction(event, resolvedAction, entityContext)
  }

  if (agreementReviewRuntimeEntityTypes.has(entityContext.entityType)) {
    return await authorizeAgreementRuntimeAction(event, resolvedAction, entityContext)
  }

  if (extensionRuntime) {
    return await authorizeExtensionOwnerAction(
      event,
      resolvedAction === 'delete_assessment_child' ? 'delete' : 'update',
      extensionRuntime
    )
  }

  const agencyContext = await authorizeSchemaAgencyRuntimeAction(event, resolvedAction, entityContext)
  if (agencyContext) {
    return agencyContext
  }

  return await forbidden(event)
}

const agreementRuntimeOwnerTables = {
  fundingcaseagreement: 'Funding_Case_Agreement_Profile',
  fundingcaseagreementcloseout: 'Funding_Case_Agreement_Closeout',
  fundingcaseagreementclaim: 'Funding_Case_Agreement_Claim',
  fundingcaseamendment: 'Funding_Case_Agreement_Amendment',
  fundingcaseagreementcommitment: 'Funding_Case_Agreement_Commitment',
  fundingcaseforecast: 'Funding_Case_Agreement_Forecast',
  fundingcasemonitor: 'Funding_Case_Agreement_Monitor',
  fundingcasepayment: 'Funding_Case_Agreement_Payment',
  fundingclaimreconcile: 'Funding_Case_Agreement_Claim_Reconcile'
} as const

/** Locks the concrete runtime owner and its review artifacts after the root entity lock. */
const lockReviewRuntimeTarget = async (
  trx: Transaction<Database>,
  entityContext: ReviewRuntimeEntityContext
): Promise<void> => {
  if (isAgreementRuntimeEntityType(entityContext.entityType)) {
    const ownerTable = agreementRuntimeOwnerTables[entityContext.entityType]
    await trx
      .selectFrom(ownerTable)
      .select('id')
      .where('id', '=', entityContext.entityId)
      .where('_deleted', '=', false)
      .forUpdate()
      .executeTakeFirst()
  }

  let runtimeId: string | null = null
  if (entityContext.reviewSetId) {
    const runtime = await trx.selectFrom('Common_Runtime')
      .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.egcs_cn_runtime', 'Common_Runtime.id')
      .innerJoin('Common_Review_Set', 'Common_Review_Set.egcs_cn_runtimeitem', 'Common_Runtime_Item.id')
      .select('Common_Runtime.id')
      .where('Common_Review_Set.id', '=', entityContext.reviewSetId)
      .where('Common_Review_Set._deleted', '=', false)
      .where('Common_Runtime_Item._deleted', '=', false)
      .where('Common_Runtime._deleted', '=', false)
      .forUpdate('Common_Runtime')
      .executeTakeFirst()
    runtimeId = runtime ? String(runtime.id) : null
  }

  if (runtimeId) {
    await trx.selectFrom('Common_Runtime_Item').select('id')
      .where('egcs_cn_runtime', '=', runtimeId)
      .where('_deleted', '=', false)
      .orderBy('id', 'asc')
      .forUpdate()
      .execute()
  }

  if (entityContext.reviewSetId) {
    await trx
      .selectFrom('Common_Review_Set')
      .select('id')
      .where('id', '=', entityContext.reviewSetId)
      .where('_deleted', '=', false)
      .forUpdate()
      .executeTakeFirst()
  }

  if (entityContext.reviewId) {
    await trx
      .selectFrom('Common_Review')
      .select('id')
      .where('id', '=', entityContext.reviewId)
      .where('_deleted', '=', false)
      .forUpdate()
      .executeTakeFirst()
  }

  if (entityContext.approvalEntityType === 'commonrecommendation' && entityContext.approvalEntityId) {
    await trx
      .selectFrom('Common_Recommendation')
      .select('id')
      .where('id', '=', entityContext.approvalEntityId)
      .where('_deleted', '=', false)
      .forUpdate()
      .executeTakeFirst()
  }
}

/** Resolves the same runtime target again after its lock has been acquired. */
const resolveLockedReviewRuntimeTarget = async (
  trx: Transaction<Database>,
  entityContext: ReviewRuntimeEntityContext
): Promise<ReviewRuntimeEntityContext | null> => {
  if (entityContext.approvalEntityType === 'commonrecommendation' && entityContext.approvalEntityId) {
    return await resolveReviewRuntimeEntityFromRecommendation(trx, entityContext.approvalEntityId)
  }
  if (entityContext.reviewId) {
    return await resolveReviewRuntimeEntityFromReview(trx, entityContext.reviewId)
  }
  if (entityContext.reviewSetId) {
    return await resolveReviewRuntimeEntityFromReviewSet(trx, entityContext.reviewSetId)
  }
  return await resolveReviewRuntimeEntityFromEntity(trx, entityContext.entityType, entityContext.entityId)
}

const reviewRuntimeTargetMatches = (
  initial: ReviewRuntimeEntityContext,
  current: ReviewRuntimeEntityContext
): boolean => initial.entityType === current.entityType
  && initial.entityId === current.entityId
  && (initial.agreementId ?? null) === (current.agreementId ?? null)
  && (initial.applicantRecipientLeadAgencyId ?? null) === (current.applicantRecipientLeadAgencyId ?? null)
  && (initial.schemaAgencyId ?? null) === (current.schemaAgencyId ?? null)
  && (initial.reviewSetId ?? null) === (current.reviewSetId ?? null)
  && (initial.reviewId ?? null) === (current.reviewId ?? null)
  && (initial.approvalEntityType ?? null) === (current.approvalEntityType ?? null)
  && (initial.approvalEntityId ?? null) === (current.approvalEntityId ?? null)

/** Locks the current Proponent owner before any independently assigned runtime artifact. */
const lockApplicantRecipientRuntimeOwner = async (
  event: H3Event,
  trx: Transaction<Database>,
  entityContext: ReviewRuntimeEntityContext
): Promise<ReviewRuntimeEntityContext> => {
  const profile = await trx
    .selectFrom('Applicant_Recipient_Profile')
    .select(['id', 'egcs_ar_leadagency'])
    .where('id', '=', entityContext.entityId)
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!profile) {
    return await respondReviewRuntimeEntityNotFound(event, 'applicantrecipient')
  }
  if (!profile.egcs_ar_leadagency) {
    return await forbidden(event)
  }
  return {
    ...entityContext,
    entityId: String(profile.id),
    applicantRecipientLeadAgencyId: String(profile.egcs_ar_leadagency)
  }
}

/** Locks and verifies the runtime target before the caller mutates review data. */
const requireLockedReviewRuntimeTarget = async (
  event: H3Event,
  trx: Transaction<Database>,
  entityContext: ReviewRuntimeEntityContext
): Promise<ReviewRuntimeEntityContext> => {
  await lockReviewRuntimeTarget(trx, entityContext)
  const current = await resolveLockedReviewRuntimeTarget(trx, entityContext)
  if (!current) {
    return await respondReviewRuntimeEntityNotFound(event, entityContext.entityType)
  }
  const decoratedCurrent = {
    ...current,
    approvalEntityType: entityContext.approvalEntityType ?? null,
    approvalEntityId: entityContext.approvalEntityId ?? null
  }
  if (!reviewRuntimeTargetMatches(entityContext, decoratedCurrent)) {
    return await throwApiError(event, {
      statusCode: 409,
      code: 'REVIEW_RUNTIME_TARGET_CHANGED',
      key: 'apiErrors.review.runtime_target_changed'
    })
  }
  return decoratedCurrent
}

type ReviewRuntimeWriteCallback<T> = (
  trx: Transaction<Database>,
  entityContext: ReviewRuntimeEntityContext
) => Promise<T>

const projectQualifiedRuntimeOwner = (
  entityContext: ReviewRuntimeEntityContext,
  evidence: QualifiedRuntimeLockEvidence
): ReviewRuntimeEntityContext => {
  const owner = evidence.runtime.lockedEntity.owner
  return {
    ...entityContext,
    agreementId: owner.owner === 'agreement' ? owner.ownerId : null,
    applicantRecipientLeadAgencyId: owner.owner === 'proponent' ? owner.agencyId : null,
    schemaAgencyId: owner.agencyId
  }
}

const getQualifiedRuntimeAssignmentTarget = (
  evidence: QualifiedRuntimeLockEvidence,
  current: ReviewRuntimeEntityContext
) => {
  const exactTarget = getReviewRuntimeReadTarget(current)
  if (isAssignableEntityType(exactTarget.entityType)) return exactTarget
  if (evidence.runtime.loaded.definition.assignmentMode === 'independent') {
    return { entityType: current.entityType, entityId: current.entityId }
  }
  const owner = evidence.runtime.lockedEntity.owner
  return {
    entityType: owner.owner === 'agreement' ? 'fundingcaseagreement' as const : 'applicantrecipient' as const,
    entityId: owner.ownerId
  }
}

const executeQualifiedRuntimeArtifactMutation = async <T>(
  event: H3Event,
  entityContext: ReviewRuntimeEntityContext,
  authorizeMutation: (
    evidence: QualifiedRuntimeLockEvidence,
    current: ReviewRuntimeEntityContext
  ) => Promise<void>,
  callback: ReviewRuntimeWriteCallback<T>
): Promise<T> => {
  const initial = await resolveQualifiedRuntimeTransactionPlan(
    event,
    entityContext.entityType,
    entityContext.entityId
  )
  if (!initial) return await forbidden(event)
  const result = await executeQualifiedRuntimeTransaction(event, initial, {
    missingOwner: 'identity_changed',
    work: async evidence => {
      const locked = await requireLockedReviewRuntimeTarget(event, evidence.trx, entityContext)
      const current = projectQualifiedRuntimeOwner(locked, evidence)
      await authorizeMutation(evidence, current)
      return await callback(evidence.trx, current)
    }
  })
  return result as T
}

/**
 * Executes a review mutation under fresh grants and root/artifact locks.
 * Assignable work resolves to the exact artifact target; Proponents retain their owner model.
 */
const executeFreshAuthorizedReviewRuntimeMutation = async <T>(
  event: H3Event,
  entityContext: ReviewRuntimeEntityContext,
  entityAction: 'read' | 'update' | 'delete',
  callback: ReviewRuntimeWriteCallback<T>
): Promise<T> => {
  const db = event.context.$db

  const executeAssignedMutation = async (): Promise<T> => await db.transaction().execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx)
    const current = await requireLockedReviewRuntimeTarget(event, trx, entityContext)
    const workTarget = getReviewRuntimeReadTarget(current)
    if (!isAssignableEntityType(workTarget.entityType)) return await forbidden(event)
    await authorizeFreshAssignedItem(
      event,
      trx,
      authContext,
      workTarget.entityType,
      workTarget.entityId,
      entityAction
    )
    return await callback(trx, current)
  })

  const requestedWorkTarget = getReviewRuntimeReadTarget(entityContext)

  if (entityContext.entityType.includes(':')) {
    return await executeQualifiedRuntimeArtifactMutation(
      event,
      entityContext,
      async (evidence, current) => {
        const workTarget = getQualifiedRuntimeAssignmentTarget(evidence, current)
        await authorizeQualifiedRuntimeMutation(evidence, workTarget, entityAction)
      },
      callback
    )
  }

  if (isIndependentProponentReviewTarget(entityContext, requestedWorkTarget)) {
    return await db.transaction().execute(async trx => {
      const authContext = await requireFreshAuthContext(event, trx)
      const lockedOwnerContext = await lockApplicantRecipientRuntimeOwner(event, trx, entityContext)
      const current = await requireLockedReviewRuntimeTarget(event, trx, lockedOwnerContext)
      const workTarget = getReviewRuntimeReadTarget(current)
      if (!isIndependentProponentReviewTarget(current, workTarget)
        || !isAssignableEntityType(workTarget.entityType)) {
        return await forbidden(event)
      }
      await authorizeFreshAssignedItem(
        event,
        trx,
        authContext,
        workTarget.entityType,
        workTarget.entityId,
        entityAction
      )
      return await callback(trx, current)
    })
  }

  // Agreement-domain writes must always take the Agreement aggregate lock before
  // locking an assignable child such as an Amendment. This prevents workflow
  // start/retry/cancel from opposing the canonical Agreement -> child lock order.
  if (isAgreementRuntimeEntityType(entityContext.entityType) && entityContext.agreementId) {
    const agreementContext = await resolveAgreementScopeContext(entityContext.agreementId, db)
    if (!agreementContext) return await forbidden(event)

    let lockedRuntimeTarget: ReviewRuntimeEntityContext | null = null
    return await executeFreshAuthorizedAgreementWrite(
      event,
      db,
      entityContext.agreementId,
      agreementContext,
      async trx => callback(trx, lockedRuntimeTarget ?? await requireLockedReviewRuntimeTarget(event, trx, entityContext)),
      {
        action: entityAction,
        blocksApprovalSubmission: false,
        allowDuringCloseout: entityContext.entityType === 'fundingcaseagreementcloseout',
        businessStatusMode: 'engine',
        businessStatusTarget: {
          entityType: entityContext.entityType,
          entityId: entityContext.entityId
        },
        authorize: async (trx, currentAgreementContext, authContext) => {
          lockedRuntimeTarget = await requireLockedReviewRuntimeTarget(event, trx, {
            ...entityContext,
            schemaAgencyId: currentAgreementContext.agencyId
          })
          const lockedWorkTarget = getReviewRuntimeReadTarget(lockedRuntimeTarget)
          if (!isAssignableEntityType(lockedWorkTarget.entityType)) return await forbidden(event)
          await authorizeFreshAssignedItem(
            event,
            trx,
            authContext,
            lockedWorkTarget.entityType,
            lockedWorkTarget.entityId,
            entityAction
          )
        }
      }
    )
  }

  if (isAssignableEntityType(requestedWorkTarget.entityType)) return await executeAssignedMutation()

  if (entityContext.entityType === 'applicantrecipient') {
    return await executeFreshAuthorizedApplicantRecipientWrite(
      event,
      db,
      entityContext.entityId,
      entityAction,
      async trx => callback(trx, await requireLockedReviewRuntimeTarget(event, trx, entityContext))
    )
  }

  return await db.transaction().execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx)
    const current = await requireLockedReviewRuntimeTarget(event, trx, entityContext)
    if (!current.schemaAgencyId) return await forbidden(event)
    await authorizeWithFreshAuthContext(event, authContext, 'agency', entityAction, {
      type: 'agency',
      agencyId: current.schemaAgencyId
    })
    return await callback(trx, current)
  })
}

/** Executes an owner-managed review write under fresh owning-entity update access. */
export const executeFreshAuthorizedReviewRuntimeWrite = async <T>(
  event: H3Event,
  entityContext: ReviewRuntimeEntityContext,
  callback: ReviewRuntimeWriteCallback<T>
): Promise<T> => await executeFreshAuthorizedReviewRuntimeMutation(
  event,
  entityContext,
  'update',
  callback
)

type ApprovalAddStepAuthorization = { canManage: boolean }
type ApprovalAddStepWriteCallback<T> = (
  trx: Transaction<Database>,
  entityContext: ReviewRuntimeEntityContext,
  authorization: ApprovalAddStepAuthorization
) => Promise<T>

const canAuthorizeFreshAssignedWork = async (
  event: H3Event,
  trx: Transaction<Database>,
  authContext: AuthContext,
  target: ApprovalTarget
): Promise<boolean> => {
  if (!target.entityId || !isAssignableEntityType(target.entityType)) return false
  try {
    await authorizeFreshAssignedItem(
      event,
      trx,
      authContext,
      target.entityType,
      target.entityId,
      'update'
    )
    return true
  } catch (error) {
    if (getErrorStatusCode(error) === 403) return false
    throw error
  }
}

/** Executes approval-step insertion after freshly resolving manager-versus-actor authority under locks. */
export const executeFreshAuthorizedApprovalAddStepWrite = async <T>(
  event: H3Event,
  entityContext: ReviewRuntimeEntityContext,
  callback: ApprovalAddStepWriteCallback<T>
): Promise<T> => {
  const authorizeLocked = async (
    trx: Transaction<Database>,
    authContext: AuthContext,
    current: ReviewRuntimeEntityContext
  ): Promise<boolean> => {
    const canManage = await canAuthorizeFreshAssignedWork(
      event,
      trx,
      authContext,
      getReviewRuntimeReadTarget(current)
    )
    if (canManage) return true
    const actor = await resolveCurrentCommonUser(event, trx)
    const target = getApprovalActionFallbackTarget(current)
    if (!actor || !await hasAssignedApproval(
      trx,
      actor.id,
      target.entityId,
      target.entityType,
      { lock: true }
    )) return await forbidden(event)
    return false
  }

  if (entityContext.entityType.includes(':')) {
    let canManage = false
    return await executeQualifiedRuntimeArtifactMutation(
      event,
      entityContext,
      async (evidence, current) => {
        try {
          await authorizeQualifiedRuntimeMutation(
            evidence,
            getQualifiedRuntimeAssignmentTarget(evidence, current),
            'update'
          )
          canManage = true
        } catch (error) {
          if (getErrorStatusCode(error) !== 403) throw error
          const target = getApprovalActionFallbackTarget(current)
          if (!await hasAssignedApproval(
            evidence.trx,
            evidence.actorUserId,
            target.entityId,
            target.entityType,
            { lock: true }
          )) return await forbidden(event)
        }
      },
      async (trx, current) => await callback(trx, current, { canManage })
    )
  }

  if (isAgreementRuntimeEntityType(entityContext.entityType) && entityContext.agreementId) {
    const agreementContext = await resolveAgreementScopeContext(entityContext.agreementId, event.context.$db)
    if (!agreementContext) return await forbidden(event)
    let current: ReviewRuntimeEntityContext | null = null
    let canManage = false
    return await executeFreshAuthorizedAgreementWrite(
      event,
      event.context.$db,
      entityContext.agreementId,
      agreementContext,
      async trx => await callback(
        trx,
        current ?? await requireLockedReviewRuntimeTarget(event, trx, entityContext),
        { canManage }
      ),
      {
        action: 'update',
        blocksApprovalSubmission: false,
        allowDuringCloseout: entityContext.entityType === 'fundingcaseagreementcloseout',
        businessStatusMode: 'engine',
        businessStatusTarget: { entityType: entityContext.entityType, entityId: entityContext.entityId },
        authorize: async (trx, lockedAgreement, authContext) => {
          current = await requireLockedReviewRuntimeTarget(event, trx, {
            ...entityContext,
            schemaAgencyId: lockedAgreement.agencyId
          })
          canManage = await authorizeLocked(trx, authContext, current)
        }
      }
    )
  }

  return await event.context.$db.transaction().execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx)
    const ownerContext = entityContext.entityType === 'applicantrecipient'
      ? await lockApplicantRecipientRuntimeOwner(event, trx, entityContext)
      : entityContext
    const current = await requireLockedReviewRuntimeTarget(event, trx, ownerContext)
    const canManage = await authorizeLocked(trx, authContext, current)
    return await callback(trx, current, { canManage })
  })
}

/** Executes workflow owner recovery using the independent manage-assignments grant. */
export const executeFreshAuthorizedWorkflowOwnerRecovery = async <T>(
  event: H3Event,
  entityContext: ReviewRuntimeEntityContext,
  callback: ReviewRuntimeWriteCallback<T>
): Promise<T> => {
  const authorizeRecovery = async (
    trx: Transaction<Database>,
    authContext: AuthContext,
    current: ReviewRuntimeEntityContext
  ): Promise<void> => {
    if (!isAssignableEntityType(current.entityType)
      || !await canManageEntityAssignmentsWithContext(authContext, trx, current.entityType, current.entityId)) {
      return await forbidden(event)
    }
  }

  if (isAgreementRuntimeEntityType(entityContext.entityType) && entityContext.agreementId) {
    const agreementContext = await resolveAgreementScopeContext(entityContext.agreementId, event.context.$db)
    if (!agreementContext) return await forbidden(event)
    let lockedRuntimeTarget: ReviewRuntimeEntityContext | null = null
    return await executeFreshAuthorizedAgreementWrite(
      event,
      event.context.$db,
      entityContext.agreementId,
      agreementContext,
      async trx => callback(
        trx,
        lockedRuntimeTarget ?? await requireLockedReviewRuntimeTarget(event, trx, entityContext)
      ),
      {
        action: 'update',
        blocksApprovalSubmission: false,
        allowDuringCloseout: entityContext.entityType === 'fundingcaseagreementcloseout',
        businessStatusMode: 'engine',
        businessStatusTarget: {
          entityType: entityContext.entityType,
          entityId: entityContext.entityId
        },
        authorize: async (trx, currentAgreementContext, authContext) => {
          lockedRuntimeTarget = await requireLockedReviewRuntimeTarget(event, trx, {
            ...entityContext,
            schemaAgencyId: currentAgreementContext.agencyId
          })
          await authorizeRecovery(trx, authContext, lockedRuntimeTarget)
        }
      }
    )
  }

  return await event.context.$db.transaction().execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx)
    const current = await requireLockedReviewRuntimeTarget(event, trx, entityContext)
    await authorizeRecovery(trx, authContext, current)
    return await callback(trx, current)
  })
}

/**
 * Executes a compatibility workflow recommendation write against the exact current
 * Recommendation assignment. The source identifier is used only to locate the runtime item;
 * it never substitutes source or Agreement authority for Recommendation work authority.
 */
export const executeFreshAuthorizedCurrentRecommendationWrite = async <T>(
  event: H3Event,
  entityContext: ReviewRuntimeEntityContext,
  callback: ReviewRuntimeWriteCallback<T>
): Promise<T> => {
  const authorizeRecommendation = async (
    trx: Transaction<Database>,
    authContext: AuthContext,
    current: ReviewRuntimeEntityContext
  ): Promise<void> => {
    const recommendation = await trx.selectFrom('Common_Recommendation')
      .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Recommendation.egcs_cn_runtimeitem')
      .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Common_Runtime_Item.egcs_cn_runtime')
      .select('Common_Recommendation.id')
      .where('Common_Runtime.egcs_cn_entitytype', '=', current.entityType)
      .where('Common_Runtime.egcs_cn_entityid', '=', current.entityId)
      .where('Common_Runtime.egcs_cn_kind', '=', 'workflow')
      .where('Common_Runtime.egcs_cn_state', '=', 'active')
      .where('Common_Runtime._deleted', '=', false)
      .where('Common_Runtime_Item.egcs_cn_state', '=', 'active')
      .where('Common_Runtime_Item._deleted', '=', false)
      .where('Common_Recommendation._deleted', '=', false)
      .orderBy('Common_Recommendation.id', 'desc')
      .forUpdate('Common_Recommendation')
      .executeTakeFirst()
    if (!recommendation) {
      return await throwApiError(event, {
        statusCode: 404,
        code: 'WORKFLOW_RECOMMENDATION_NOT_FOUND',
        key: 'apiErrors.admin_common.not_found'
      })
    }
    await authorizeFreshAssignedItem(event, trx, authContext, 'commonrecommendation', String(recommendation.id))
  }

  if (entityContext.entityType.includes(':')) {
    return await executeQualifiedRuntimeArtifactMutation(
      event,
      entityContext,
      async (evidence, current) => await authorizeRecommendation(evidence.trx, evidence.auth, current),
      callback
    )
  }

  if (isAgreementRuntimeEntityType(entityContext.entityType) && entityContext.agreementId) {
    const agreementContext = await resolveAgreementScopeContext(entityContext.agreementId, event.context.$db)
    if (!agreementContext) return await forbidden(event)
    let lockedRuntimeTarget: ReviewRuntimeEntityContext | null = null
    return await executeFreshAuthorizedAgreementWrite(
      event,
      event.context.$db,
      entityContext.agreementId,
      agreementContext,
      async trx => callback(
        trx,
        lockedRuntimeTarget ?? await requireLockedReviewRuntimeTarget(event, trx, entityContext)
      ),
      {
        action: 'update',
        blocksApprovalSubmission: false,
        allowDuringCloseout: entityContext.entityType === 'fundingcaseagreementcloseout',
        businessStatusMode: 'engine',
        businessStatusTarget: {
          entityType: entityContext.entityType,
          entityId: entityContext.entityId
        },
        authorize: async (trx, currentAgreementContext, authContext) => {
          lockedRuntimeTarget = await requireLockedReviewRuntimeTarget(event, trx, {
            ...entityContext,
            schemaAgencyId: currentAgreementContext.agencyId
          })
          await authorizeRecommendation(trx, authContext, lockedRuntimeTarget)
        }
      }
    )
  }

  return await event.context.$db.transaction().execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx)
    const ownerContext = entityContext.entityType === 'applicantrecipient'
      ? await lockApplicantRecipientRuntimeOwner(event, trx, entityContext)
      : entityContext
    const current = await requireLockedReviewRuntimeTarget(event, trx, ownerContext)
    await authorizeRecommendation(trx, authContext, current)
    return await callback(trx, current)
  })
}

/** Executes an owner-managed review child deletion under fresh owning-entity delete access. */
export const executeFreshAuthorizedReviewRuntimeDelete = async <T>(
  event: H3Event,
  entityContext: ReviewRuntimeEntityContext,
  callback: ReviewRuntimeWriteCallback<T>
): Promise<T> => await executeFreshAuthorizedReviewRuntimeMutation(
  event,
  entityContext,
  'delete',
  callback
)

const executeFreshAuthorizedReviewActorMutation = async <T>(
  event: H3Event,
  entityContext: ReviewRuntimeEntityContext,
  requireAssignedApproval: boolean,
  callback: ReviewRuntimeWriteCallback<T>
): Promise<T> => {
  const authorizeActor = async (
    trx: Transaction<Database>,
    current: ReviewRuntimeEntityContext
  ): Promise<void> => {
    const currentCommonUser = await resolveCurrentCommonUser(event, trx)
    if (
      !current.reviewId
      || !currentCommonUser
      || (requireAssignedApproval && !(await hasAssignedApproval(trx, currentCommonUser.id, current.reviewId)))
    ) {
      return await forbidden(event)
    }
  }

  if (isAgreementRuntimeEntityType(entityContext.entityType) && entityContext.agreementId) {
    const agreementContext = await resolveAgreementScopeContext(entityContext.agreementId, event.context.$db)
    if (!agreementContext) return await forbidden(event)
    let lockedRuntimeTarget: ReviewRuntimeEntityContext | null = null
    return await executeFreshAuthorizedAgreementWrite(
      event,
      event.context.$db,
      entityContext.agreementId,
      agreementContext,
      async trx => callback(
        trx,
        lockedRuntimeTarget ?? await requireLockedReviewRuntimeTarget(event, trx, entityContext)
      ),
      {
        action: 'update',
        blocksApprovalSubmission: false,
        allowDuringCloseout: entityContext.entityType === 'fundingcaseagreementcloseout',
        businessStatusMode: 'engine',
        businessStatusTarget: {
          entityType: entityContext.entityType,
          entityId: entityContext.entityId
        },
        authorize: async (trx, currentAgreementContext, authContext) => {
          lockedRuntimeTarget = await requireLockedReviewRuntimeTarget(event, trx, {
            ...entityContext,
            schemaAgencyId: currentAgreementContext.agencyId
          })
          await authorizeFreshReviewRuntimeReadAccess(event, trx, authContext, lockedRuntimeTarget)
          await authorizeActor(trx, lockedRuntimeTarget)
        }
      }
    )
  }

  return await event.context.$db.transaction().execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx)
    const current = await requireLockedReviewRuntimeTarget(event, trx, entityContext)
    await authorizeFreshReviewRuntimeReadAccess(event, trx, authContext, current)
    await authorizeActor(trx, current)
    return await callback(trx, current)
  })
}

/** Executes an assigned review approver's mutation under fresh assignment and artifact locks. */
export const executeFreshAuthorizedReviewActorWrite = async <T>(
  event: H3Event,
  entityContext: ReviewRuntimeEntityContext,
  callback: ReviewRuntimeWriteCallback<T>
): Promise<T> => await executeFreshAuthorizedReviewActorMutation(event, entityContext, true, callback)

/**
 * Executes an assigned approval actor write for either a review approval or a direct approval
 * target. Direct targets retain fresh owning-entity read authorization; review approvals retain
 * their established assignment-based review access.
 */
export const executeFreshAuthorizedApprovalActorWrite = async <T>(
  event: H3Event,
  entityContext: ReviewRuntimeEntityContext,
  callback: ReviewRuntimeWriteCallback<T>
): Promise<T> => {
  const approvalTarget = getApprovalActionFallbackTarget(entityContext)
  if (approvalTarget.entityType === 'commonreview' && !entityContext.entityType.includes(':')) {
    return await executeFreshAuthorizedReviewActorWrite(event, entityContext, callback)
  }

  if (isAgreementRuntimeEntityType(entityContext.entityType) && entityContext.agreementId) {
    const agreementContext = await resolveAgreementScopeContext(entityContext.agreementId, event.context.$db)
    if (!agreementContext) return await forbidden(event)
    let lockedRuntimeTarget: ReviewRuntimeEntityContext | null = null
    return await executeFreshAuthorizedAgreementWrite(
      event,
      event.context.$db,
      entityContext.agreementId,
      agreementContext,
      async trx => callback(
        trx,
        lockedRuntimeTarget ?? await requireLockedReviewRuntimeTarget(event, trx, entityContext)
      ),
      {
        action: 'update',
        blocksApprovalSubmission: false,
        allowDuringCloseout: entityContext.entityType === 'fundingcaseagreementcloseout',
        businessStatusMode: 'engine',
        businessStatusTarget: {
          entityType: entityContext.entityType,
          entityId: entityContext.entityId
        },
        authorize: async (trx, currentAgreementContext) => {
          lockedRuntimeTarget = await requireLockedReviewRuntimeTarget(event, trx, {
            ...entityContext,
            schemaAgencyId: currentAgreementContext.agencyId
          })
          const currentCommonUser = await resolveCurrentCommonUser(event, trx)
          if (
            !currentCommonUser
            || !(await hasAssignedApproval(
              trx,
              currentCommonUser.id,
              approvalTarget.entityId,
              approvalTarget.entityType
            ))
          ) {
            return await forbidden(event)
          }
        }
      }
    )
  }

  if (entityContext.entityType.includes(':')) {
    return await executeQualifiedRuntimeArtifactMutation(
      event,
      entityContext,
      async (evidence) => {
        if (!(await hasAssignedApproval(
          evidence.trx,
          evidence.actorUserId,
          approvalTarget.entityId,
          approvalTarget.entityType
        ))) return await forbidden(event)
      },
      callback
    )
  }

  return await event.context.$db.transaction().execute(async trx => {
    await requireFreshAuthContext(event, trx)
    const current = await requireLockedReviewRuntimeTarget(event, trx, entityContext)
    const currentCommonUser = await resolveCurrentCommonUser(event, trx)
    if (
      !currentCommonUser
      || !(await hasAssignedApproval(
        trx,
        currentCommonUser.id,
        approvalTarget.entityId,
        approvalTarget.entityType
      ))
    ) {
      return await forbidden(event)
    }
    return await callback(trx, current)
  })
}

/** Executes an additional reviewer's own-row mutation without requiring an approval assignment. */
export const executeFreshAuthorizedReviewAdditionalReviewerWrite = async <T>(
  event: H3Event,
  entityContext: ReviewRuntimeEntityContext,
  callback: ReviewRuntimeWriteCallback<T>
): Promise<T> => await executeFreshAuthorizedReviewActorMutation(event, entityContext, false, callback)

/**
 * Boolean wrapper around `authorizeReviewRuntimeAction` for read paths that need to expose
 * capability flags in the payload without using exceptions as expected control flow.
 *
 * @param event - Active H3 event.
 * @param action - Review runtime action to probe.
 * @param entityContext - Resolved owning entity metadata for the runtime artifact.
 * @returns True when the action is allowed, false for authorization denials.
 */
export const canAuthorizeReviewRuntimeAction = async (
  event: H3Event,
  action: ReviewRuntimeAction,
  entityContext: ReviewRuntimeEntityContext
): Promise<boolean> => {
  try {
    await authorizeReviewRuntimeAction(event, action, entityContext)
    return true
  } catch (error) {
    if (getErrorStatusCode(error) === 403) {
      return false
    }

    throw error
  }
}
