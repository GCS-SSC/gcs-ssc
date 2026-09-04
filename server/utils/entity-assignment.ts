/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Assignment helpers are documented by their explicit authorization-oriented names and types. */
import type { H3Event } from 'h3'
import { sql, type Kysely, type Transaction } from 'kysely'
import type { AuthorizationResourceOwner, AuthorizationScope, ExactEntityTarget } from '@gcs-ssc/authorization'
import { notFound } from '~~/server/utils/api-errors'
import { requireAuthContext, type AuthContext } from '~~/server/utils/authorize'
import { canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { canAccessApplicantRecipient } from '~~/server/utils/applicant-recipient-auth'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import type { AssignableEntityType, Database, Entity_Type } from '~~/shared/types/database'
import { ASSIGNABLE_ENGINE_OPEN_QUEUE_STATUSES, isAssignableEntityType } from '~~/shared/utils/entity-assignments'
import { getEntityAuthorizationPolicy } from '~~/server/utils/entity-authorization-policy'
import { defineUsersAbilities } from '~~/server/utils/rbac'
import { resolveCompletionEvidenceId } from '~~/server/utils/completion-runtime-core'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export const createPrimaryEntityAssignment = async (
  trx: Transaction<Database>,
  entityType: AssignableEntityType,
  entityId: string,
  commonUserId: string
): Promise<void> => {
  await trx.insertInto('Common_Entity_Assignment').values({
    egcs_cn_entityid: entityId,
    egcs_cn_entitytype: entityType,
    egcs_cn_user: commonUserId,
    egcs_cn_isprimary: true,
    egcs_cn_createdby: commonUserId
  }).execute()
}

export const resolveAssignmentCommonUserId = async (db: Kysely<Database>, applicationUserId: string): Promise<string | null> => {
  const row = await db.selectFrom('user').innerJoin('Common_User', 'Common_User.egcs_cn_auth_user_id', 'user.id')
    .select('Common_User.id').where('user.id', '=', applicationUserId).where('user._deleted', '=', false).where('Common_User._deleted', '=', false).executeTakeFirst()
  return row ? String(row.id) : null
}

export const resolveAssignmentActor = async (event: H3Event): Promise<{ auth: AuthContext; commonUserId: string }> => {
  const auth = await requireAuthContext(event)
  const commonUser = await resolveCurrentCommonUser(event)
  if (!commonUser) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
  return { auth, commonUserId: commonUser.id }
}

const resolveAgreementOwner = async (
  db: Kysely<Database>,
  agreementId: string
): Promise<AuthorizationResourceOwner | null> => {
  const agreement = await resolveAgreementScopeContext(agreementId, db)
  if (!agreement) return null
  return { kind: 'agreement', agreementId, agencyId: agreement.agencyId }
}

const resolveAgreementIdFromEntity = async (
  db: Kysely<Database>,
  entityType: Entity_Type,
  entityId: string
): Promise<string | null> => {
  if (!isAssignableEntityType(entityType)) return null
  const policy = getEntityAuthorizationPolicy(entityType)
  if (policy.ownerResolver === 'agreement') return entityId
  if (policy.ownerResolver === 'agreement_claim_parent') {
    const row = await db.selectFrom('Funding_Case_Agreement_Claim_Reconcile')
      .innerJoin('Funding_Case_Agreement_Claim', 'Funding_Case_Agreement_Claim.id', 'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim')
      .select('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement')
      .where('Funding_Case_Agreement_Claim_Reconcile.id', '=', entityId)
      .where('Funding_Case_Agreement_Claim_Reconcile._deleted', '=', false)
      .executeTakeFirst()
    return row ? String(row.egcs_fc_fundingagreement) : null
  }
  if (policy.ownerResolver !== 'agreement_parent' || !policy.ownerColumn) return null
  const result = await sql<{ agreement_id: string }>`
    SELECT ${sql.ref(policy.ownerColumn)}::text AS agreement_id
    FROM ${sql.table(policy.table)}
    WHERE id = ${entityId} AND _deleted = false
  `.execute(db)
  return result.rows[0]?.agreement_id ?? null
}

const resolveApplicantRecipientOwner = async (
  db: Kysely<Database>,
  applicantRecipientId: string
): Promise<AuthorizationResourceOwner | null> => {
  const profile = await db.selectFrom('Applicant_Recipient_Profile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Applicant_Recipient_Profile.egcs_ar_leadagency')
    .select('Applicant_Recipient_Profile.egcs_ar_leadagency as agency_id')
    .where('Applicant_Recipient_Profile.id', '=', applicantRecipientId)
    .where('Applicant_Recipient_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
    .executeTakeFirst()
  if (!profile?.agency_id) return null
  return {
    kind: 'applicant_recipient',
    applicantRecipientId,
    agencyId: String(profile.agency_id)
  }
}

const resolveStreamOwner = async (
  db: Kysely<Database>,
  streamId: string
): Promise<AuthorizationResourceOwner | null> => {
  const stream = await db.selectFrom('Transfer_Payment_Stream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .select([
      'Transfer_Payment_Profile.id as transfer_payment_id',
      'Transfer_Payment_Profile.egcs_tp_agency as agency_id'
    ])
    .where('Transfer_Payment_Stream.id', '=', streamId)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
    .executeTakeFirst()
  if (!stream) return null
  return {
    kind: 'transfer_payment_stream',
    agencyId: String(stream.agency_id),
    transferPaymentId: String(stream.transfer_payment_id),
    streamId
  }
}

type RuntimeAssignmentSource = {
  target: ExactEntityTarget<AssignableEntityType> | null
  entityType: Entity_Type
  entityId: string
  fallbackAgencyId: string | null
}

const resolveRuntimeAssignmentSource = async (
  db: Kysely<Database>,
  entityType: 'commonreview' | 'commonrecommendation',
  entityId: string
): Promise<RuntimeAssignmentSource | null> => {
  if (entityType === 'commonreview') {
    const review = await db.selectFrom('Common_Review')
      .innerJoin('Common_Review_Set', 'Common_Review_Set.id', 'Common_Review.egcs_cn_reviewset')
      .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review.egcs_cn_reviewschema')
      .select([
        'Common_Review_Set.egcs_cn_entitytype as entity_type',
        'Common_Review_Set.egcs_cn_entityid as entity_id',
        'Common_Review_Schema.egcs_cn_agency as agency_id'
      ])
      .where('Common_Review.id', '=', entityId)
      .where('Common_Review._deleted', '=', false)
      .where('Common_Review_Set._deleted', '=', false)
      .executeTakeFirst()
    if (!review) return null
    const sourceEntityId = String(review.entity_id)
    return {
      target: isAssignableEntityType(review.entity_type)
        ? { entityType: review.entity_type, entityId: sourceEntityId }
        : null,
      entityType: review.entity_type,
      entityId: sourceEntityId,
      fallbackAgencyId: review.agency_id ? String(review.agency_id) : null
    }
  }

  const recommendation = await db.selectFrom('Common_Recommendation')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Recommendation.egcs_cn_runtimeitem')
    .innerJoin('Common_Recommendation_Schema', 'Common_Recommendation_Schema.id', 'Common_Runtime_Item.egcs_cn_publication')
    .select([
      'Common_Recommendation.egcs_cn_entitytype as entity_type',
      'Common_Recommendation.egcs_cn_entityid as entity_id',
      'Common_Recommendation_Schema.egcs_cn_agency as agency_id'
    ])
    .where('Common_Recommendation.id', '=', entityId)
    .where('Common_Recommendation._deleted', '=', false)
    .executeTakeFirst()
  if (!recommendation) return null
  const sourceEntityId = String(recommendation.entity_id)
  return {
    target: isAssignableEntityType(recommendation.entity_type)
      ? { entityType: recommendation.entity_type, entityId: sourceEntityId }
      : null,
    entityType: recommendation.entity_type,
    entityId: sourceEntityId,
    fallbackAgencyId: recommendation.agency_id ? String(recommendation.agency_id) : null
  }
}

const resolveSourceOwner = async (
  db: Kysely<Database>,
  source: RuntimeAssignmentSource
): Promise<AuthorizationResourceOwner | null> => {
  if (source.entityType === 'applicantrecipient') {
    return await resolveApplicantRecipientOwner(db, source.entityId)
  }
  if (source.entityType === 'transferpaymentstream') {
    return await resolveStreamOwner(db, source.entityId)
  }
  const agreementId = await resolveAgreementIdFromEntity(db, source.entityType, source.entityId)
  if (agreementId) return await resolveAgreementOwner(db, agreementId)
  if (source.target && (source.target.entityType === 'commonreview' || source.target.entityType === 'commonrecommendation')) {
    return await resolveEntityAssignmentOwner(db, source.target.entityType, source.target.entityId)
  }
  return source.fallbackAgencyId ? { kind: 'agency', agencyId: source.fallbackAgencyId } : null
}

/** Resolves the explicit inherited-authorization owner of one exact assignable item. */
export const resolveEntityAssignmentOwner = async (
  db: Kysely<Database>,
  entityType: AssignableEntityType,
  entityId: string
): Promise<AuthorizationResourceOwner | null> => {
  if (!isPositivePostgresBigintText(entityId)) return null
  const policy = getEntityAuthorizationPolicy(entityType)
  if (policy.ownerResolver === 'applicant_recipient') return await resolveApplicantRecipientOwner(db, entityId)
  if (policy.ownerResolver === 'agreement') return await resolveAgreementOwner(db, entityId)
  if (policy.ownerResolver === 'runtime_source' && (entityType === 'commonreview' || entityType === 'commonrecommendation')) {
    const source = await resolveRuntimeAssignmentSource(db, entityType, entityId)
    return source ? await resolveSourceOwner(db, source) : null
  }
  const agreementId = await resolveAgreementIdFromEntity(db, entityType, entityId)
  return agreementId ? await resolveAgreementOwner(db, agreementId) : null
}

/** Resolves the explicitly declared source used for runtime ownership inheritance. */
export const resolveEntityAssignmentSourceTarget = async (
  db: Kysely<Database>,
  entityType: AssignableEntityType,
  entityId: string
): Promise<ExactEntityTarget<AssignableEntityType> | null> => {
  if (!isPositivePostgresBigintText(entityId)) return null
  if (entityType !== 'commonreview' && entityType !== 'commonrecommendation') return null
  return (await resolveRuntimeAssignmentSource(db, entityType, entityId))?.target ?? null
}

/** Compatibility resolver for Agreement-only callers. */
export const resolveAssignmentAgreementId = async (
  db: Kysely<Database>,
  entityType: AssignableEntityType,
  entityId: string
): Promise<string | null> => {
  const owner = await resolveEntityAssignmentOwner(db, entityType, entityId)
  return owner?.kind === 'agreement' ? owner.agreementId : null
}

export const canAccessEntityAssignmentOwner = async (
  context: AuthContext,
  owner: AuthorizationResourceOwner,
  action: 'read' | 'update',
  db: Kysely<Database>
): Promise<boolean> => {
  if (owner.kind === 'applicant_recipient') {
    return await canAccessApplicantRecipient(context, owner.applicantRecipientId, action, db)
  }
  if (owner.kind === 'agreement') {
    const agreement = await resolveAgreementScopeContext(owner.agreementId, db)
    return agreement ? await canAccessAgreement(context, action, agreement.scope, db) : false
  }
  if (owner.kind === 'transfer_payment_stream') {
    return context.userAbilities.authorize('transfer_payment', action, {
      type: 'entity',
      agencyId: owner.agencyId,
      path: [
        { type: 'transfer_payment', id: owner.transferPaymentId },
        { type: 'transfer_payment_stream', id: owner.streamId }
      ]
    })
  }
  return context.userAbilities.authorize('agency', action, { type: 'agency', agencyId: owner.agencyId })
}

export const canManageEntityAssignmentsWithContext = async (
  context: AuthContext,
  db: Kysely<Database>,
  entityType: AssignableEntityType,
  entityId: string
): Promise<boolean> => {
  const owner = await resolveEntityAssignmentOwner(db, entityType, entityId)
  if (!owner) return false
  if (owner.kind === 'applicant_recipient') {
    return context.userAbilities.canManageAssignments('applicant_recipient', {
      type: 'agency', agencyId: owner.agencyId
    })
  }
  if (owner.kind === 'agreement') {
    const agreement = await resolveAgreementScopeContext(owner.agreementId, db)
    return Boolean(agreement && context.userAbilities.canManageAssignments('agreement', agreement.scope))
  }
  return false
}

export const canManageEntityAssignments = async (event: H3Event, entityType: AssignableEntityType, entityId: string): Promise<boolean> => {
  const context = await requireAuthContext(event)
  if (!await canManageEntityAssignmentsWithContext(context, event.context.$db, entityType, entityId)) return false
  return await isEntityAssignmentRosterWorkable(event.context.$db, entityType, entityId)
}

/** Keeps ordinary roster visibility separate from exact assignment and approval authority. */
export const canReadEntityAssignmentRoster = (evidence: {
  hasInheritedOwnerRead: boolean
  hasAssignmentManagement: boolean
  hasExactAssignment: boolean
  hasApprovalAssignment: boolean
}): boolean => evidence.hasInheritedOwnerRead || evidence.hasAssignmentManagement

export const isEntityAssignmentRosterWorkable = async (db: Kysely<Database>, entityType: AssignableEntityType, entityId: string): Promise<boolean> => {
  const policy = getEntityAuthorizationPolicy(entityType)
  if (entityType === 'applicantrecipient') {
    const row = await db.selectFrom('Applicant_Recipient_Profile')
      .select('egcs_ar_active')
      .where('id', '=', entityId)
      .where('_deleted', '=', false)
      .executeTakeFirst()
    return row?.egcs_ar_active === true
  }
  if (entityType === 'commonreview') {
    const row = await db.selectFrom('Common_Review')
      .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Review.egcs_cn_runtimeitem')
      .select('Common_Runtime_Item.egcs_cn_state as status')
      .where('Common_Review.id', '=', entityId)
      .where('Common_Review._deleted', '=', false)
      .where('Common_Runtime_Item._deleted', '=', false)
      .executeTakeFirst()
    if (!row || !ASSIGNABLE_ENGINE_OPEN_QUEUE_STATUSES.commonreview.has(String(row.status))) return false
    return !await resolveCompletionEvidenceId(db, 'commonreview', entityId)
  }
  if (entityType === 'commonrecommendation') {
    const row = await db.selectFrom('Common_Recommendation')
      .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Recommendation.egcs_cn_runtimeitem')
      .select('Common_Runtime_Item.egcs_cn_state as status')
      .where('Common_Recommendation.id', '=', entityId)
      .where('Common_Recommendation._deleted', '=', false)
      .where('Common_Runtime_Item._deleted', '=', false)
      .executeTakeFirst()
    if (!row || !ASSIGNABLE_ENGINE_OPEN_QUEUE_STATUSES.commonrecommendation.has(String(row.status))) return false
    return !await resolveCompletionEvidenceId(db, 'commonrecommendation', entityId)
  }
  if (policy.statusColumn === null) {
    const row = await db.selectFrom(policy.table as keyof Database)
      .select('id').where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst()
    return Boolean(row)
  }
  const row = await db.selectFrom(policy.table as keyof Database)
    .select(sql<string>`${sql.ref(policy.statusColumn)}`.as('status'))
    .where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst()
  if (!row) return false
  const [definition, completion] = await Promise.all([
    db.selectFrom('Common_Status').select(['egcs_cn_readonly', 'egcs_cn_terminal'])
      .where('id', '=', String(row.status)).where('_deleted', '=', false).executeTakeFirst(),
    db.selectFrom('Common_Completion').select('id')
      .where('egcs_cn_entitytype', '=', entityType).where('egcs_cn_entityid', '=', entityId)
      .where('_deleted', '=', false).executeTakeFirst()
  ])
  return Boolean(definition && !definition.egcs_cn_readonly && !definition.egcs_cn_terminal && !completion)
}

export const canReadEntityAssignments = async (event: H3Event, entityType: AssignableEntityType, entityId: string): Promise<boolean> => {
  if (!isPositivePostgresBigintText(entityId)) return false
  const actor = await resolveAssignmentActor(event)
  const db = event.context.$db
  let runtimeSource: RuntimeAssignmentSource | null = null
  if (entityType === 'commonreview' || entityType === 'commonrecommendation') {
    runtimeSource = await resolveRuntimeAssignmentSource(db, entityType, entityId)
  }
  let owner: AuthorizationResourceOwner | null
  if (runtimeSource) {
    owner = await resolveSourceOwner(db, runtimeSource)
  } else {
    owner = await resolveEntityAssignmentOwner(db, entityType, entityId)
  }
  const [inheritedOwnerRead, canManage] = await Promise.all([
    owner ? canAccessEntityAssignmentOwner(actor.auth, owner, 'read', db) : Promise.resolve(false),
    canManageEntityAssignmentsWithContext(actor.auth, db, entityType, entityId)
  ])
  return canReadEntityAssignmentRoster({
    hasInheritedOwnerRead: inheritedOwnerRead,
    hasAssignmentManagement: canManage,
    hasExactAssignment: false,
    hasApprovalAssignment: false
  })
}

export const isAgencyValidEntityAssignee = async (event: H3Event, entityType: AssignableEntityType, entityId: string, commonUserId: string): Promise<boolean> => {
  return await isAgencyValidEntityAssigneeWithDb(event.context.$db, entityType, entityId, commonUserId)
}

export const isAgencyValidEntityAssigneeWithDb = async (db: Kysely<Database>, entityType: AssignableEntityType, entityId: string, commonUserId: string): Promise<boolean> => {
  return (await resolveAgencyValidEntityAssigneeIdsWithDb(db, entityType, entityId, [commonUserId])).has(commonUserId)
}

/** Resolves eligible common-user IDs in one owner lookup and one batched role-graph load. */
export const resolveAgencyValidEntityAssigneeIdsWithDb = async (
  db: Kysely<Database>,
  entityType: AssignableEntityType,
  entityId: string,
  commonUserIds: string[]
): Promise<Set<string>> => {
  if (!isPositivePostgresBigintText(entityId)) return new Set()
  const uniqueCommonUserIds = [...new Set(commonUserIds.map(String))]
  if (uniqueCommonUserIds.length === 0) return new Set()
  const applicationUsers = await db.selectFrom('Common_User').innerJoin('user', 'user.id', 'Common_User.egcs_cn_auth_user_id')
    .where('Common_User.id', 'in', uniqueCommonUserIds).where('Common_User._deleted', '=', false).where('user._deleted', '=', false)
    .select(['Common_User.id as common_user_id', 'user.id as application_user_id']).execute()
  if (applicationUsers.length === 0) return new Set()
  const owner = await resolveEntityAssignmentOwner(db, entityType, entityId)
  if (!owner) return new Set()
  const abilitiesByUserId = await defineUsersAbilities(applicationUsers.map(user => String(user.application_user_id)), db)
  let subject: 'agency' | 'agreement' | 'applicant_recipient' | 'transfer_payment'
  let scope: AuthorizationScope
  if (owner.kind === 'applicant_recipient') {
    subject = 'applicant_recipient'
    scope = { type: 'agency', agencyId: owner.agencyId } as const
  } else if (owner.kind === 'agreement') {
    const agreement = await resolveAgreementScopeContext(owner.agreementId, db)
    if (!agreement) return new Set()
    subject = 'agreement'
    scope = agreement.scope
  } else if (owner.kind === 'transfer_payment_stream') {
    subject = 'transfer_payment'
    scope = {
      type: 'entity', agencyId: owner.agencyId,
      path: [
        { type: 'transfer_payment', id: owner.transferPaymentId },
        { type: 'transfer_payment_stream', id: owner.streamId }
      ]
    }
  } else {
    subject = 'agency'
    scope = { type: 'agency', agencyId: owner.agencyId } as const
  }
  return new Set(applicationUsers.filter(user => abilitiesByUserId
    .get(String(user.application_user_id))
    ?.authorize(subject, 'update', scope)).map(user => String(user.common_user_id)))
}
