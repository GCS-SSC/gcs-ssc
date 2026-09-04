import type { H3Event } from 'h3'
import { sql, type Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { requireAuthContext } from '~~/server/utils/authorize'
import { resolveAgreementCommitmentRuntimeContext } from '~~/server/utils/agreement-commitment'
import { resolveAgreementForecastRuntimeContext } from '~~/server/utils/agreement-forecast'
import { resolveAgreementMonitorRuntimeContext } from '~~/server/utils/agreement-monitor'
import { resolveAgreementPaymentRuntimeContext } from '~~/server/utils/agreement-payment'
import { resolveAgreementClaimReconcileRuntimeContext, resolveAgreementClaimRuntimeContext } from '~~/server/utils/agreement-claim'
import { resolveAgreementCloseoutRuntimeContext } from '~~/server/utils/agreement-closeout'
import { resolveAgreementAmendmentRuntimeContext } from '~~/server/utils/agreement-amendment'
import { resolveAgreementScopeContext } from '~~/server/utils/agreement'
import type { ReviewRuntimeEntityContext } from '~~/server/utils/review-runtime-access'
import { getActiveStructuralRoleAssignments, selectActiveStructuralRoleIds } from '~~/server/utils/active-user-scopes'
import { escapeLikePattern } from '~~/server/utils/sql-like'

const agreementOwnerResolvers = {
  fundingcaseagreement: async (db: Kysely<Database>, agreementId: string) => {
    const context = await resolveAgreementScopeContext(agreementId, db)
    return context ? { ...context, agreementId } : null
  },
  fundingcaseamendment: resolveAgreementAmendmentRuntimeContext,
  fundingcaseagreementcloseout: resolveAgreementCloseoutRuntimeContext,
  fundingcaseagreementclaim: resolveAgreementClaimRuntimeContext,
  fundingcaseagreementcommitment: resolveAgreementCommitmentRuntimeContext,
  fundingcaseforecast: resolveAgreementForecastRuntimeContext,
  fundingcasemonitor: resolveAgreementMonitorRuntimeContext,
  fundingcasepayment: resolveAgreementPaymentRuntimeContext,
  fundingclaimreconcile: resolveAgreementClaimReconcileRuntimeContext
} as const

type AgreementOwnerEntityType = keyof typeof agreementOwnerResolvers

/**
 * Identifies review entities that inherit access from an exact Agreement.
 *
 * @param entityType - Candidate runtime review entity type.
 * @returns True when the entity has an Agreement owner resolver.
 */
const isAgreementOwnerEntityType = (
  entityType: Database['Common_Review_Set']['egcs_cn_entitytype']
): entityType is AgreementOwnerEntityType => entityType in agreementOwnerResolvers

/**
 * Resolves the exact Agreement that owns a supported review runtime entity.
 *
 * @param db - Database used to resolve the runtime entity.
 * @param entityType - Runtime review entity type.
 * @param entityId - Runtime entity identifier.
 * @returns The exact Agreement id, or null when the type is unsupported or missing.
 */
const resolveAgreementOwnerId = async (
  db: Kysely<Database>,
  entityType: Database['Common_Review_Set']['egcs_cn_entitytype'],
  entityId: string
): Promise<string | null> => {
  if (!isAgreementOwnerEntityType(entityType)) return null
  const context = await agreementOwnerResolvers[entityType](db, entityId)
  return context ? String(context.agreementId) : null
}

export type AdditionalReviewerExecutableContext = {
  executableEntityType: 'commonreview'
  executableEntityId: string
  reviewId: string
  reviewRuntimeState: string
  reviewSetRuntimeState: string | null
  runtimeEntity: ReviewRuntimeEntityContext
}

export type AdditionalReviewerRowContext = AdditionalReviewerExecutableContext & {
  row: {
    id: string
    comments: string
    assignedUserId: string
    assignedUserName: string
    completedAt: string | null
  }
}

/**
 * Additional reviewers attach to the executable runtime entity (`commonreview` today),
 * but authorization still resolves through the owning business entity behind that review.
 * This keeps the storage model generic without introducing a separate review-only RBAC model.
 *
 * @param db - Database connection used to resolve the executable runtime entity.
 * @param reviewId - Runtime review identifier backing the executable activity.
 * @returns The executable activity context and parent-entity authorization context.
 */
export const resolveAdditionalReviewerExecutableContextFromReview = async (
  db: Kysely<Database>,
  reviewId: string
): Promise<AdditionalReviewerExecutableContext | null> => {
  const review = await db
    .selectFrom('Common_Review')
    .innerJoin('Common_Review_Set', 'Common_Review_Set.id', 'Common_Review.egcs_cn_reviewset')
    .innerJoin('Common_Runtime_Item as Review_Item', 'Review_Item.id', 'Common_Review.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime_Item as Set_Item', 'Set_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review.egcs_cn_reviewschema')
    .leftJoin('Applicant_Recipient_Profile', join => join
      .onRef('Applicant_Recipient_Profile.id', '=', 'Common_Review_Set.egcs_cn_entityid')
      .on('Common_Review_Set.egcs_cn_entitytype', '=', 'applicantrecipient')
      .on('Applicant_Recipient_Profile._deleted', '=', false))
    .select([
      'Common_Review_Set.egcs_cn_entitytype as entity_type',
      'Common_Review_Set.egcs_cn_entityid as entity_id',
      'Common_Review_Set.id as review_set_id',
      'Set_Item.egcs_cn_state as reviewSetRuntimeState',
      'Common_Review_Schema.egcs_cn_agency as schema_agency_id',
      'Applicant_Recipient_Profile.id as applicant_recipient_id',
      'Applicant_Recipient_Profile.egcs_ar_leadagency as applicant_recipient_lead_agency',
      'Review_Item.egcs_cn_state as reviewRuntimeState'
    ])
    .where('Common_Review.id', '=', reviewId)
    .where('Common_Review._deleted', '=', false)
    .where('Common_Review_Set._deleted', '=', false)
    .executeTakeFirst()

  if (!review) {
    return null
  }

  if (review.entity_type === 'applicantrecipient' && !review.applicant_recipient_id) {
    return null
  }

  const agreementId = await resolveAgreementOwnerId(db, review.entity_type, String(review.entity_id))
  if (isAgreementOwnerEntityType(review.entity_type) && !agreementId) {
    return null
  }

  return {
    executableEntityType: 'commonreview',
    executableEntityId: reviewId,
    reviewId,
    reviewRuntimeState: review.reviewRuntimeState,
    reviewSetRuntimeState: review.reviewSetRuntimeState ?? null,
    runtimeEntity: {
      entityType: review.entity_type,
      entityId: String(review.entity_id),
      agreementId,
      applicantRecipientLeadAgencyId: review.applicant_recipient_lead_agency
        ? String(review.applicant_recipient_lead_agency)
        : null,
      schemaAgencyId: review.schema_agency_id ? String(review.schema_agency_id) : null,
      reviewSetId: String(review.review_set_id),
      reviewId
    }
  }
}

/**
 * Resolves an additional reviewer row back to the executable runtime entity and its
 * parent-entity authorization context.
 *
 * @param db - Database connection used to load the row and its executable review.
 * @param additionalReviewerId - Additional reviewer row identifier.
 * @returns The row details plus executable and parent-entity context.
 */
export const resolveAdditionalReviewerRowContext = async (
  db: Kysely<Database>,
  additionalReviewerId: string
): Promise<AdditionalReviewerRowContext | null> => {
  const row = await db
    .selectFrom('Common_Additional_Reviewers')
    .innerJoin('Common_User', 'Common_User.id', 'Common_Additional_Reviewers.egcs_cn_user')
    .select([
      'Common_Additional_Reviewers.id as id',
      'Common_Additional_Reviewers.egcs_cn_entitytype as entityType',
      'Common_Additional_Reviewers.egcs_cn_entityid as entityId',
      'Common_Additional_Reviewers.egcs_cn_comments as comments',
      'Common_Additional_Reviewers.egcs_cn_user as assignedUserId',
      'Common_Additional_Reviewers.egcs_cn_completedat as completedAt',
      'Common_User.egcs_cn_name as assignedUserName'
    ])
    .where('Common_Additional_Reviewers.id', '=', additionalReviewerId)
    .where('Common_Additional_Reviewers._deleted', '=', false)
    .where('Common_User._deleted', '=', false)
    .executeTakeFirst()

  if (!row || row.entityType !== 'commonreview') {
    return null
  }

  const executableContext = await resolveAdditionalReviewerExecutableContextFromReview(db, String(row.entityId))

  if (!executableContext) {
    return null
  }

  return {
    ...executableContext,
    row: {
      id: String(row.id),
      comments: row.comments ?? '',
      assignedUserId: String(row.assignedUserId),
      assignedUserName: row.assignedUserName,
      completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null
    }
  }
}

/**
 * Runtime activity assignees are stored as `Common_User`, while authenticated sessions are
 * backed by Better Auth's `user` table. Resolve that bridge server-side so the client never
 * has to reason about the two user identifiers.
 *
 * @param event - Active H3 event for the authenticated request.
 * @param db - Database or transaction used to resolve the current Common User.
 * @returns The matching `Common_User` row for the authenticated application user.
 */
export const resolveCurrentCommonUser = async (
  event: H3Event,
  db: Kysely<Database> = event.context.$db
): Promise<{ id: string; name: string; positionTitle: string | null } | null> => {
  const context = await requireAuthContext(event)

  const commonUser = await db
    .selectFrom('user')
    .innerJoin('Common_User', 'Common_User.egcs_cn_auth_user_id', 'user.id')
    .select([
      'Common_User.id as id',
      'Common_User.egcs_cn_name as name',
      'Common_User.egcs_cn_position_title as positionTitle'
    ])
    .where('user.id', '=', context.userId)
    .where('user._deleted', '=', false)
    .where('Common_User._deleted', '=', false)
    .executeTakeFirst()

  if (!commonUser) {
    return null
  }

  return {
    id: String(commonUser.id),
    name: commonUser.name,
    positionTitle: commonUser.positionTitle ?? null
  }
}

/**
 * Assignee options stay limited to the assessment schema's agency. This route intentionally
 * does not reuse `/api/users`, because assignment here should not require a separate `user.read`
 * grant beyond the executable activity's own update access.
 *
 * @param db - Database connection used to resolve agency-scoped users.
 * @param agencyId - Schema agency that constrains the assignee options.
 * @returns Agency-scoped `Common_User` options that can be assigned.
 */
export const listAgencyScopedCommonUsers = async (
  db: Kysely<Database>,
  agencyId: string
): Promise<Array<{ id: string; name: string }>> => {
  const roleScopedUserIds = db
    .selectFrom('user_role_assignment')
    .innerJoin('role', 'role.id', 'user_role_assignment.role_id')
    .where('user_role_assignment._deleted', '=', false)
    .where('role._deleted', '=', false)
    .where(eb => eb.or([
      eb('role.agency_id', '=', agencyId),
      eb('role.agency_id', 'is', null)
    ]))
    .select('user_role_assignment.user_id')

  const users = await db
    .selectFrom('Common_User')
    .innerJoin('user', 'user.id', 'Common_User.egcs_cn_auth_user_id')
    .select([
      'Common_User.id as id',
      'Common_User.egcs_cn_name as name',
      'user.id as user_id'
    ])
    .where('Common_User._deleted', '=', false)
    .where('user._deleted', '=', false)
    .where('user.id', 'in', roleScopedUserIds)
    .distinct()
    .orderBy('Common_User.egcs_cn_name', 'asc')
    .execute()

  const activeAssignments = await getActiveStructuralRoleAssignments(
    db,
    users.map(user => String(user.user_id))
  )
  const eligibleApplicationUserIds = new Set(activeAssignments
    .filter(assignment => assignment.scopeType === 'global' || assignment.agencyId === agencyId)
    .map(assignment => assignment.userId))

  return users.filter(user => eligibleApplicationUserIds.has(String(user.user_id))).map(user => ({
    id: String(user.id),
    name: user.name
  }))
}

/**
 * Returns a bounded, stable page of active Common Users eligible through the Agency's structural roles.
 * @param db Database connection.
 * @param agencyId Agency that constrains role eligibility.
 * @param page One-based page number.
 * @param limit Maximum page size.
 * @param search Optional literal name search.
 * @returns Eligible page and filtered total.
 */
export const listAgencyScopedCommonUsersPage = async (
  db: Kysely<Database>,
  agencyId: string,
  page: number,
  limit: number,
  search?: string
): Promise<{ items: Array<{ id: string, name: string }>, total: number }> => {
  let query = db.selectFrom('Common_User')
    .innerJoin('user', 'user.id', 'Common_User.egcs_cn_auth_user_id')
    .innerJoin('user_role_assignment', 'user_role_assignment.user_id', 'user.id')
    .innerJoin('role', 'role.id', 'user_role_assignment.role_id')
    .where('Common_User._deleted', '=', false)
    .where('user._deleted', '=', false)
    .where('user_role_assignment._deleted', '=', false)
    .where('role.id', 'in', selectActiveStructuralRoleIds(db))
    .where(eb => eb.or([eb('role.agency_id', '=', agencyId), eb('role.agency_id', 'is', null)]))
  if (search?.trim()) {
    const escapedSearch = escapeLikePattern(search.trim())
    query = query.where('Common_User.egcs_cn_name', 'ilike', `%${escapedSearch}%`)
  }
  const [rows, count] = await Promise.all([
    query.select(['Common_User.id', 'Common_User.egcs_cn_name as name'])
      .distinctOn('Common_User.id')
      .orderBy('Common_User.id', 'asc')
      .limit(limit).offset((page - 1) * limit).execute(),
    query.select(sql<number>`count(DISTINCT "Common_User"."id")`.as('total')).executeTakeFirst()
  ])
  return {
    items: rows.map(row => ({ id: String(row.id), name: row.name })),
    total: Number(count?.total ?? 0)
  }
}

/**
 * Shared count query for additional reviewer rows, with an optional pending-only filter.
 *
 * @param db - Database connection.
 * @param reviewId - Executable runtime review id.
 * @param pendingOnly - Whether to restrict to incomplete reviewer rows.
 * @returns The number of matching reviewer rows.
 */
const countReviewAdditionalReviewersBase = async (
  db: Kysely<Database>,
  reviewId: string,
  pendingOnly: boolean
): Promise<number> => {
  let query = db
    .selectFrom('Common_Additional_Reviewers')
    .select(eb => eb.fn.count('id').as('total'))
    .where('egcs_cn_entitytype', '=', 'commonreview')
    .where('egcs_cn_entityid', '=', reviewId)
    .where('_deleted', '=', false)

  if (pendingOnly) {
    query = query.where('egcs_cn_completedat', 'is', null)
  }

  const result = await query.executeTakeFirst()

  return Number(result?.total ?? 0)
}

/**
 * Counts all active additional reviewer rows attached to a runtime review.
 *
 * @param db - Database connection.
 * @param reviewId - Runtime review identifier.
 * @returns Total number of active reviewer rows.
 */
export const countReviewAdditionalReviewers = async (
  db: Kysely<Database>,
  reviewId: string
): Promise<number> => await countReviewAdditionalReviewersBase(db, reviewId, false)

/**
 * Counts incomplete additional reviewer rows attached to a runtime review.
 *
 * @param db - Database connection.
 * @param reviewId - Runtime review identifier.
 * @returns Number of pending reviewer rows.
 */
export const countPendingReviewAdditionalReviewers = async (
  db: Kysely<Database>,
  reviewId: string
): Promise<number> => await countReviewAdditionalReviewersBase(db, reviewId, true)
