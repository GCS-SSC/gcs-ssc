/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Assignment helpers are documented by their explicit authorization-oriented names and types. */
import type { H3Event } from 'h3'
import { sql, type Kysely, type Transaction } from 'kysely'
import type { AuthorizationResourceOwner, AuthorizationScope, ExactEntityTarget } from '@gcs-ssc/authorization'
import { notFound } from '~~/server/utils/api-errors'
import { requireAuthContext, type AuthContext } from '~~/server/utils/authorize'
import { resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { canAccessApplicantRecipient } from '~~/server/utils/applicant-recipient-auth'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import type { AssignableEntityType, Database, Entity_Type } from '~~/shared/types/database'
import { ASSIGNABLE_ENGINE_OPEN_QUEUE_STATUSES, isAssignableEntityType, isRuntimeAssignableEntityType, type RuntimeAssignableEntityType } from '~~/shared/utils/entity-assignments'
import { getEntityAuthorizationPolicy } from '~~/server/utils/entity-authorization-policy'
import { defineUsersAbilities } from '~~/server/utils/rbac'
import { getActiveStructuralRoleAssignments } from '~~/server/utils/active-user-scopes'
import { resolveCompletionEvidenceId } from '~~/server/utils/completion-runtime-core'
import { resolveCanonicalLifecycleIdentity } from './extension-lifecycle-identity'
import { loadExtensionLifecycleEntity, isExtensionEnabledForAgency, isExtensionEnabledForStream } from './extensions'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { resolveFundingCaseScope } from './funding-case'
import { canAccessCreditMemoTargetScopes, resolveCreditMemoAuthorityTarget } from './credit-memo-scope-authority'
import { resolveAccountReceivableCreditMemoRuntimeContext } from './account-receivable-context'

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
  agreementId: string,
  subject: 'agreement' | 'journal_voucher' | 'correction' | 'account_receivable' = 'agreement'
): Promise<AuthorizationResourceOwner | null> => {
  const agreement = await resolveAgreementScopeContext(agreementId, db)
  if (!agreement) return null
  return { kind: 'agreement', agreementId, agencyId: agreement.agencyId, ...(subject !== 'agreement' ? { subject } : {}) }
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
      .where('Funding_Case_Agreement_Claim._deleted', '=', false)
      .executeTakeFirst()
    return row ? String(row.egcs_fc_fundingagreement) : null
  }
  if (policy.ownerResolver !== 'agreement_parent' || !policy.ownerColumn) return null
  if (entityType === 'fundingcaseaccountreceivable' || entityType === 'fundingcaseaccountreceivableadjustment') {
    const row = await db.selectFrom('Funding_Case_Agreement_Account_Receivable').select('egcs_fc_fundingagreement')
      .where('id', '=', entityId).where('egcs_fc_entitytype', '=', entityType).where('_deleted', '=', false).executeTakeFirst()
    return row ? String(row.egcs_fc_fundingagreement) : null
  }
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
    .select('Applicant_Recipient_Profile.id')
    .where('Applicant_Recipient_Profile.id', '=', applicantRecipientId)
    .where('Applicant_Recipient_Profile._deleted', '=', false)
    .executeTakeFirst()
  if (!profile) return null
  return {
    kind: 'applicant_recipient',
    applicantRecipientId,
    agencyId: ''
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
  reviewSetId?: string
}

const resolveRuntimeAssignmentSource = async (
  db: Kysely<Database>,
  entityType: RuntimeAssignableEntityType,
  entityId: string
): Promise<RuntimeAssignmentSource | null> => {
  if (entityType === 'commonreview') {
    const review = await db.selectFrom('Common_Review')
      .innerJoin('Common_Review_Set', 'Common_Review_Set.id', 'Common_Review.egcs_cn_reviewset')
      .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review.egcs_cn_reviewschema')
      .select([
        'Common_Review_Set.id as review_set_id',
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
      reviewSetId: String(review.review_set_id),
      entityType: review.entity_type,
      entityId: sourceEntityId,
      fallbackAgencyId: review.agency_id ? String(review.agency_id) : null
    }
  }

  const source = entityType === 'commondatacollection'
    ? await db.selectFrom('Common_Data_Collection')
        .innerJoin('Common_Data_Collection_Setup', 'Common_Data_Collection_Setup.id', 'Common_Data_Collection.egcs_cn_datacollectionsetup')
        .select(['Common_Data_Collection.egcs_cn_entitytype as entity_type',
          'Common_Data_Collection.egcs_cn_entityid as entity_id', 'Common_Data_Collection_Setup.egcs_cn_agency as agency_id'])
        .where('Common_Data_Collection.id', '=', entityId).where('Common_Data_Collection._deleted', '=', false)
        .executeTakeFirst()
    : await db.selectFrom('Common_Recommendation')
        .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Recommendation.egcs_cn_runtimeitem')
        .innerJoin('Common_Recommendation_Schema', 'Common_Recommendation_Schema.id', 'Common_Runtime_Item.egcs_cn_publication')
        .select(['Common_Recommendation.egcs_cn_entitytype as entity_type',
          'Common_Recommendation.egcs_cn_entityid as entity_id', 'Common_Recommendation_Schema.egcs_cn_agency as agency_id'])
        .where('Common_Recommendation.id', '=', entityId).where('Common_Recommendation._deleted', '=', false)
        .executeTakeFirst()
  if (!source) return null
  const sourceEntityId = String(source.entity_id)
  return {
    target: isAssignableEntityType(source.entity_type)
      ? { entityType: source.entity_type, entityId: sourceEntityId }
      : null,
    entityType: source.entity_type,
    entityId: sourceEntityId,
    fallbackAgencyId: source.agency_id ? String(source.agency_id) : null
  }
}

const resolveSourceOwner = async (
  db: Kysely<Database>,
  source: RuntimeAssignmentSource
): Promise<AuthorizationResourceOwner | null> => {
  if (source.entityType.includes(':')) {
    const identity = await resolveCanonicalLifecycleIdentity(db, source.entityType, source.entityId)
    if (!identity) return null
    const loaded = await loadExtensionLifecycleEntity(source.entityType)
    if (!loaded || loaded.definition.ownerKind !== identity.owner.owner) return null
    if (!await isExtensionEnabledForAgency(db, loaded.extension.key, identity.owner.agencyId)) return null
    if (identity.scope.streamId && !await isExtensionEnabledForStream(db, loaded.extension.key, identity.scope.streamId)) return null
    return identity.owner.owner === 'agreement'
      ? { kind: 'agreement', agreementId: identity.owner.ownerId, agencyId: identity.owner.agencyId }
      : { kind: 'applicant_recipient', applicantRecipientId: identity.owner.ownerId, agencyId: identity.owner.agencyId }
  }
  if (source.entityType === 'applicantrecipient') {
    const owner = await resolveApplicantRecipientOwner(db, source.entityId)
    return owner && source.fallbackAgencyId
      ? { ...owner, agencyId: source.fallbackAgencyId }
      : null
  }
  if (source.entityType === 'transferpaymentstream') {
    return await resolveStreamOwner(db, source.entityId)
  }
  if (source.entityType === 'fundingcaseaccountreceivablecreditmemo') {
    return await resolveEntityAssignmentOwner(db, source.entityType, source.entityId)
  }
  const agreementId = await resolveAgreementIdFromEntity(db, source.entityType, source.entityId)
  if (agreementId) return await resolveAgreementOwner(db, agreementId, (source.entityType === 'fundingcaseaccountreceivable' || source.entityType === 'fundingcaseaccountreceivableadjustment') ? 'account_receivable' : source.entityType === 'fundingcasecorrection' ? 'correction' : source.entityType === 'fundingcasejournalvoucher' ? 'journal_voucher' : 'agreement')
  if (source.target?.entityType === 'fundingcaseintake') {
    return await resolveEntityAssignmentOwner(db, 'fundingcaseintake', source.target.entityId)
  }
  if (source.target && isRuntimeAssignableEntityType(source.target.entityType)) {
    const owner = await resolveEntityAssignmentOwner(db, source.target.entityType, source.target.entityId)
    return owner?.kind === 'applicant_recipient' && source.fallbackAgencyId
      ? { ...owner, agencyId: source.fallbackAgencyId }
      : owner
  }
  // A missing typed business owner must never become schema-agency authority.
  if (source.target) return null
  return source.fallbackAgencyId ? { kind: 'agency', agencyId: source.fallbackAgencyId } : null
}

/** Resolves the explicit inherited-authorization owner of one exact assignable item. */
export const resolveEntityAssignmentOwner = async (
  db: Kysely<Database>,
  entityType: AssignableEntityType,
  entityId: string
): Promise<AuthorizationResourceOwner | null> => {
  if (!isPositivePostgresBigintText(entityId)) return null
  if (entityType === 'fundingcaseaccountreceivablecreditmemo') {
    const context = await resolveAccountReceivableCreditMemoRuntimeContext(db, entityId)
    if (!context) return null
    if (context.scope.type === 'agency') return { kind: 'agency', subject: 'account_receivable', agencyId: context.agencyId }
    return context.agreementId ? await resolveAgreementOwner(db, context.agreementId, 'account_receivable') : null
  }
  const policy = getEntityAuthorizationPolicy(entityType)
  if (policy.ownerResolver === 'applicant_recipient') return await resolveApplicantRecipientOwner(db, entityId)
  if (policy.ownerResolver === 'funding_case') {
    const context = await resolveFundingCaseScope(db, entityId)
    return context
      ? {
          kind: 'funding_case',
          agencyId: context.agencyId,
          transferPaymentId: context.transferPaymentId,
          streamId: context.streamId,
          opportunityId: context.opportunityId,
          intakeId: entityId
        }
      : null
  }
  if (policy.ownerResolver === 'agreement') return await resolveAgreementOwner(db, entityId)
  if (policy.ownerResolver === 'runtime_source' && isRuntimeAssignableEntityType(entityType)) {
    const source = await resolveRuntimeAssignmentSource(db, entityType, entityId)
    return source ? await resolveSourceOwner(db, source) : null
  }
  const agreementId = await resolveAgreementIdFromEntity(db, entityType, entityId)
  return agreementId ? await resolveAgreementOwner(db, agreementId, policy.subject === 'account_receivable' ? 'account_receivable' : policy.subject === 'correction' ? 'correction' : policy.subject === 'journal_voucher' ? 'journal_voucher' : 'agreement') : null
}

/** Resolves the explicitly declared source used for runtime ownership inheritance. */
export const resolveEntityAssignmentSourceTarget = async (
  db: Kysely<Database>,
  entityType: AssignableEntityType,
  entityId: string
): Promise<ExactEntityTarget<AssignableEntityType> | null> => {
  if (!isPositivePostgresBigintText(entityId)) return null
  if (!isRuntimeAssignableEntityType(entityType)) return null
  return (await resolveRuntimeAssignmentSource(db, entityType, entityId))?.target ?? null
}

/** Resolves and records every source-bearing runtime row before a qualified roster write. */
export const resolveQualifiedEntityAssignmentSource = async (
  db: Kysely<Database>,
  entityType: AssignableEntityType,
  entityId: string
) => {
  const lineage: Array<{ entityType: RuntimeAssignableEntityType; entityId: string; reviewSetId?: string }> = []
  const visited = new Set<string>()
  let currentType: Entity_Type = entityType
  let currentId = entityId
  while (isRuntimeAssignableEntityType(currentType)) {
    const key = `${currentType}:${currentId}`
    if (visited.has(key)) return null
    visited.add(key)
    const source = await resolveRuntimeAssignmentSource(db, currentType, currentId)
    if (!source) return null
    lineage.push({ entityType: currentType, entityId: currentId, reviewSetId: source.reviewSetId })
    currentType = source.entityType
    currentId = source.entityId
  }
  return currentType.includes(':')
    ? { entityType: currentType, entityId: currentId, lineage }
    : null
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
    if (!await canAccessApplicantRecipient(context, owner.applicantRecipientId, 'read', db)) return false
    return owner.agencyId
      ? context.userAbilities.authorize('applicant_recipient', action, { type: 'agency', agencyId: owner.agencyId })
      : await canAccessApplicantRecipient(context, owner.applicantRecipientId, action, db)
  }
  if (owner.kind === 'agreement') {
    const agreement = await resolveAgreementScopeContext(owner.agreementId, db)
    return Boolean(agreement && context.userAbilities.authorize(owner.subject ?? 'agreement', action, agreement.scope))
  }
  if (owner.kind === 'funding_case') {
    const caseScope = await resolveFundingCaseScope(db, owner.intakeId)
    return Boolean(caseScope && caseScope.opportunityId === owner.opportunityId
      && caseScope.transferPaymentId === owner.transferPaymentId
      && caseScope.agencyId === owner.agencyId
      && context.userAbilities.authorize('funding_case', action, caseScope.scope))
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
  return context.userAbilities.authorize(owner.subject ?? 'agency', action, { type: 'agency', agencyId: owner.agencyId })
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
    if (owner.agencyId) {
      return context.userAbilities.canManageAssignments('applicant_recipient', {
        type: 'agency', agencyId: owner.agencyId
      })
    }
    const { getUserAssignmentAgencyScopes } = await import('./rbac')
    if (context.userAbilities.canManageAssignments('applicant_recipient', { type: 'global' })) return true
    const scopes = await getUserAssignmentAgencyScopes(context.userId, db)
    return scopes.some(scope => context.userAbilities.canManageAssignments('applicant_recipient', {
      type: 'agency', agencyId: scope.agencyId
    }))
  }
  if (owner.kind === 'agreement') {
    const agreement = await resolveAgreementScopeContext(owner.agreementId, db)
    return Boolean(agreement && context.userAbilities.canManageAssignments(owner.subject ?? 'agreement', agreement.scope)
      && await canAccessCreditMemoTargetScopes(db, context, entityType, entityId, 'manage_assignments'))
  }
  if (owner.kind === 'funding_case') {
    const caseScope = await resolveFundingCaseScope(db, owner.intakeId)
    return Boolean(caseScope && context.userAbilities.canManageAssignments('funding_case', caseScope.scope))
  }
  if (owner.kind === 'agency' && owner.subject === 'account_receivable') {
    return context.userAbilities.canManageAssignments(owner.subject, { type: 'agency', agencyId: owner.agencyId })
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
  if ((entityType === 'fundingcaseaccountreceivable' || entityType === 'fundingcaseaccountreceivableadjustment') || entityType === 'fundingcaseaccountreceivablecreditmemo') {
    const table = (entityType === 'fundingcaseaccountreceivable' || entityType === 'fundingcaseaccountreceivableadjustment') ? 'Funding_Case_Agreement_Account_Receivable' : 'Funding_Case_Account_Receivable_Credit_Memo'
    const record = entityType === 'fundingcaseaccountreceivablecreditmemo'
      ? await db.selectFrom(table).select('egcs_fc_outcome').where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst()
      : await db.selectFrom('Funding_Case_Agreement_Account_Receivable').select('egcs_fc_outcome').where('id', '=', entityId).where('egcs_fc_entitytype', '=', entityType).where('_deleted', '=', false).executeTakeFirst()
    if (!record || record.egcs_fc_outcome !== 'open') return false
    const runtime = await db.selectFrom('Common_Runtime').select('id')
      .where('egcs_cn_entitytype', '=', entityType).where('egcs_cn_entityid', '=', entityId).executeTakeFirst()
    if (runtime) return false
  }
  if (entityType === 'fundingcasecorrection') {
    const correction = await db.selectFrom('Funding_Case_Agreement_Correction').select('egcs_fc_outcome')
      .where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst()
    if (!correction || correction.egcs_fc_outcome !== 'open') return false
    const evidence = await db.selectFrom('Common_Runtime').select('id')
      .where('egcs_cn_entitytype', '=', entityType).where('egcs_cn_entityid', '=', entityId).executeTakeFirst()
    const decision = await db.selectFrom('Common_Routing_Slip').select('id')
      .where('egcs_cn_entitytype', '=', entityType).where('egcs_cn_entityid', '=', entityId).executeTakeFirst()
    if (evidence || decision) return false
  }
  if (entityType === 'fundingcasejournalvoucher') {
    const voucher = await db.selectFrom('Funding_Case_Agreement_Journal_Voucher').select('egcs_fc_payment')
      .where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst()
    if (!voucher) return false
    const [latest, workflow, decision] = await Promise.all([
      db.selectFrom('Funding_Case_Agreement_Journal_Voucher').select('id')
        .where('egcs_fc_payment', '=', voucher.egcs_fc_payment).where('_deleted', '=', false).orderBy('egcs_fc_number', 'desc').executeTakeFirst(),
      db.selectFrom('Common_Workflow_Run as run').innerJoin('Common_Runtime as runtime', 'runtime.id', 'run.id').select('run.id')
        .where('runtime.egcs_cn_entitytype', '=', entityType).where('runtime.egcs_cn_entityid', '=', entityId).executeTakeFirst(),
      db.selectFrom('Common_Routing_Slip').select('id').where('egcs_cn_entitytype', '=', entityType).where('egcs_cn_entityid', '=', entityId).executeTakeFirst()
    ])
    if (String(latest?.id) !== entityId || workflow || decision) return false
  }
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
  if (entityType === 'commonrecommendation' || entityType === 'commondatacollection') {
    const table = policy.table as 'Common_Recommendation' | 'Common_Data_Collection'
    const row = await db.selectFrom(table)
      .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', `${table}.egcs_cn_runtimeitem`)
      .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Common_Runtime_Item.egcs_cn_runtime')
      .select(['Common_Runtime_Item.egcs_cn_state as status', 'Common_Runtime.egcs_cn_state as runtimeState'])
      .where(`${table}.id`, '=', entityId).where(`${table}._deleted`, '=', false)
      .where('Common_Runtime_Item._deleted', '=', false).where('Common_Runtime._deleted', '=', false)
      .executeTakeFirst()
    if (!row || !ASSIGNABLE_ENGINE_OPEN_QUEUE_STATUSES[entityType].has(String(row.status))) return false
    if (entityType === 'commondatacollection' && row.runtimeState !== 'active' && row.runtimeState !== 'paused') return false
    return !await resolveCompletionEvidenceId(db, entityType, entityId)
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
  if (isRuntimeAssignableEntityType(entityType)) {
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
    hasInheritedOwnerRead: inheritedOwnerRead && await canAccessCreditMemoTargetScopes(db, actor.auth, entityType, entityId, 'read'),
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
  let subject: 'agency' | 'agreement' | 'applicant_recipient' | 'transfer_payment' | 'funding_case' | 'journal_voucher' | 'correction' | 'account_receivable'
  let scope: AuthorizationScope
  if (owner.kind === 'applicant_recipient') {
    if (owner.agencyId) {
      return new Set(applicationUsers.filter(user => abilitiesByUserId
        .get(String(user.application_user_id))
        ?.authorize('applicant_recipient', 'update', { type: 'agency', agencyId: owner.agencyId }))
        .map(user => String(user.common_user_id)))
    }
    const activeAssignments = await getActiveStructuralRoleAssignments(db, applicationUsers.map(user => String(user.application_user_id)))
    const agencyIdsByUser = new Map<string, Set<string>>()
    for (const assignment of activeAssignments) {
      if (!assignment.agencyId) continue
      const userId = String(assignment.userId)
      const agencies = agencyIdsByUser.get(userId) ?? new Set<string>()
      agencies.add(String(assignment.agencyId))
      agencyIdsByUser.set(userId, agencies)
    }
    return new Set(applicationUsers.map(user => {
      const abilities = abilitiesByUserId.get(String(user.application_user_id))
      if (!abilities) return null
      if (abilities.authorize('applicant_recipient', 'update', { type: 'global' })) return String(user.common_user_id)
      const agencyIds = agencyIdsByUser.get(String(user.application_user_id)) ?? new Set<string>()
      return [...agencyIds].some(agencyId => abilities.authorize('applicant_recipient', 'update', { type: 'agency', agencyId }))
        ? String(user.common_user_id)
        : null
    }).filter((id): id is string => id !== null))
  } else if (owner.kind === 'agreement') {
    const agreement = await resolveAgreementScopeContext(owner.agreementId, db)
    if (!agreement) return new Set()
    subject = owner.subject ?? 'agreement'
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
  } else if (owner.kind === 'funding_case') {
    const caseScope = await resolveFundingCaseScope(db, owner.intakeId)
    if (!caseScope) return new Set()
    subject = 'funding_case'
    scope = caseScope.scope as AuthorizationScope
  } else {
    subject = owner.subject ?? 'agency'
    scope = { type: 'agency', agencyId: owner.agencyId } as const
  }
  const creditMemoId = await resolveCreditMemoAuthorityTarget(db, entityType, entityId)
  const additionalScopes: AuthorizationScope[] = []
  if (creditMemoId) {
    const { resolveAccountReceivableCreditMemoRuntimeContext } = await import('./account-receivable-context')
    const creditMemo = await resolveAccountReceivableCreditMemoRuntimeContext(db, creditMemoId)
    if (!creditMemo) return new Set()
    for (const agreementId of creditMemo.agreementIds) {
      const agreement = await resolveAgreementScopeContext(agreementId, db)
      if (!agreement || agreement.agencyId !== creditMemo.agencyId) return new Set()
      additionalScopes.push(agreement.scope)
    }
  }
  return new Set(applicationUsers.filter(user => {
    const abilities = abilitiesByUserId.get(String(user.application_user_id))
    return abilities?.authorize(subject, 'update', scope)
      && additionalScopes.every(additionalScope => abilities.authorize('account_receivable', 'update', additionalScope))
  }).map(user => String(user.common_user_id)))
}

/** Lists active users before checking Proponent role eligibility across all agencies.
 * @param db Database connection.
 * @returns Active Common User identities and names.
 */
export const listActiveCommonUsersForProponentAssignments = async (db: Kysely<Database>): Promise<Array<{ id: string; name: string }>> =>
  (await db.selectFrom('Common_User')
    .innerJoin('user', 'user.id', 'Common_User.egcs_cn_auth_user_id')
    .select(['Common_User.id as id', 'Common_User.egcs_cn_name as name'])
    .where('Common_User._deleted', '=', false)
    .where('user._deleted', '=', false)
    .orderBy('Common_User.egcs_cn_name', 'asc')
    .execute()).map(user => ({ id: String(user.id), name: user.name }))
