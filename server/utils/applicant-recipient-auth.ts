/* eslint-disable jsdoc/require-jsdoc -- Authorization helpers use explicit names and typed contracts. */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AbilityAction } from '~~/shared/utils/abilities'
import { badRequest, forbidden, notFound } from '~~/server/utils/api-errors'
import { authorizeFreshAssignedItem, requireFreshAuthContext, type AuthContext } from '~~/server/utils/authorize'
import { getUserAssignmentAgencyScopes } from '~~/server/utils/rbac'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export interface ApplicantRecipientVisibility {
  hasGlobalAccess: boolean
  agencyIds: string[]
}

export const lockActiveApplicantRecipientIds = async (
  db: Transaction<Database>,
  applicantRecipientIds: string[]
): Promise<boolean> => {
  const uniqueIds = [...new Set(applicantRecipientIds.map(String))].sort()
  if (uniqueIds.length === 0) return true
  if (uniqueIds.some(id => !isPositivePostgresBigintText(id))) return false
  const rows = await db.selectFrom('Applicant_Recipient_Profile').where('id', 'in', uniqueIds)
    .where('_deleted', '=', false)
    .where('egcs_ar_active', '=', true)
    .select('id').orderBy('id').forUpdate().execute()
  return rows.length === uniqueIds.length
}

interface ApplicantRecipientAccess {
  isAssigned: boolean
}

const resolveApplicantRecipientAccess = async (
  context: AuthContext,
  db: Kysely<Database>,
  applicantRecipientIds: string[],
  includeAssignments: boolean
): Promise<Map<string, ApplicantRecipientAccess>> => {
  const uniqueIds = [...new Set(applicantRecipientIds.map(String))]
  if (uniqueIds.length === 0) return new Map()
  if (uniqueIds.some(id => !isPositivePostgresBigintText(id))) return new Map()

  const profiles = await db.selectFrom('Applicant_Recipient_Profile')
    .where('Applicant_Recipient_Profile.id', 'in', uniqueIds)
    .where('Applicant_Recipient_Profile._deleted', '=', false)
    .select('Applicant_Recipient_Profile.id as id').execute()

  let assignedIds = new Set<string>()
  if (includeAssignments) {
    const assignments = await db.selectFrom('user')
      .innerJoin('Common_User', 'Common_User.egcs_cn_auth_user_id', 'user.id')
      .innerJoin('Common_Entity_Assignment', 'Common_Entity_Assignment.egcs_cn_user', 'Common_User.id')
      .innerJoin('Common_Entity', join => join
        .onRef('Common_Entity.id', '=', 'Common_Entity_Assignment.egcs_cn_entityid')
        .onRef('Common_Entity.egcs_cn_entitytype', '=', 'Common_Entity_Assignment.egcs_cn_entitytype'))
      .where('user.id', '=', context.userId)
      .where('user._deleted', '=', false)
      .where('Common_User._deleted', '=', false)
      .where('Common_Entity._deleted', '=', false)
      .where('Common_Entity_Assignment.egcs_cn_entitytype', '=', 'applicantrecipient')
      .where('Common_Entity_Assignment.egcs_cn_entityid', 'in', uniqueIds)
      .where('Common_Entity_Assignment._deleted', '=', false)
      .select('Common_Entity_Assignment.egcs_cn_entityid as entity_id')
      .execute()
    assignedIds = new Set(assignments.map(row => String(row.entity_id)))
  }

  return new Map(profiles.map(row => [String(row.id), {
    isAssigned: assignedIds.has(String(row.id))
  }]))
}

const allowsApplicantRecipientAction = (
  visibility: ApplicantRecipientVisibility,
  access: ApplicantRecipientAccess | undefined,
  action: AbilityAction
): boolean => access !== undefined
  && (visibility.hasGlobalAccess || visibility.agencyIds.length > 0)
  && (action === 'read' || access.isAssigned)

export const resolveApplicantRecipientVisibility = async (
  context: AuthContext,
  action: AbilityAction,
  db: Kysely<Database>
): Promise<ApplicantRecipientVisibility> => {
  if (context.userAbilities.authorize('applicant_recipient', action, { type: 'global' })) {
    return { hasGlobalAccess: true, agencyIds: [] }
  }
  const assignedScopes = await getUserAssignmentAgencyScopes(context.userId, db)
  return {
    hasGlobalAccess: false,
    agencyIds: [...new Set(assignedScopes.map(scope => scope.agencyId).filter(agencyId =>
      context.userAbilities.authorize('applicant_recipient', action, { type: 'agency', agencyId })
    ))]
  }
}

export const canAccessApplicantRecipient = async (
  context: AuthContext,
  applicantRecipientId: string,
  action: AbilityAction,
  db: Kysely<Database>
): Promise<boolean> => {
  const [access, visibility] = await Promise.all([
    resolveApplicantRecipientAccess(context, db, [applicantRecipientId], action !== 'read'),
    resolveApplicantRecipientVisibility(context, action, db)
  ])
  return allowsApplicantRecipientAction(visibility, access.get(String(applicantRecipientId)), action)
}

export const canAccessApplicantRecipientIds = async (
  context: AuthContext,
  applicantRecipientIds: string[],
  action: AbilityAction,
  db: Kysely<Database>
): Promise<boolean> => {
  const [access, visibility] = await Promise.all([
    resolveApplicantRecipientAccess(context, db, applicantRecipientIds, action !== 'read'),
    resolveApplicantRecipientVisibility(context, action, db)
  ])
  return applicantRecipientIds.every(id => allowsApplicantRecipientAction(visibility, access.get(String(id)), action))
}

export const resolveApplicantRecipientMutationPermissions = async (
  context: AuthContext,
  applicantRecipientIds: string[],
  db: Kysely<Database>
): Promise<Map<string, { canCreate: boolean; canUpdate: boolean; canDelete: boolean }>> => {
  const [access, createVisibility, updateVisibility, deleteVisibility] = await Promise.all([
    resolveApplicantRecipientAccess(context, db, applicantRecipientIds, true),
    resolveApplicantRecipientVisibility(context, 'create', db),
    resolveApplicantRecipientVisibility(context, 'update', db),
    resolveApplicantRecipientVisibility(context, 'delete', db)
  ])
  return new Map(applicantRecipientIds.map(id => {
    const itemAccess = access.get(String(id))
    return [String(id), {
      canCreate: allowsApplicantRecipientAction(createVisibility, itemAccess, 'create'),
      canUpdate: allowsApplicantRecipientAction(updateVisibility, itemAccess, 'update'),
      canDelete: allowsApplicantRecipientAction(deleteVisibility, itemAccess, 'delete')
    }]
  }))
}

export const resolveApplicantRecipientAuthorization = async (
  context: AuthContext,
  applicantRecipientId: string,
  action: AbilityAction,
  db: Kysely<Database>
) => await canAccessApplicantRecipient(context, applicantRecipientId, action, db)
  ? { bypass: true as const }
  : { denied: true as const }

export const executeFreshAuthorizedApplicantRecipientWrite = async <T>(
  event: H3Event,
  db: Kysely<Database>,
  applicantRecipientId: string,
  action: AbilityAction,
  callback: (trx: Transaction<Database>, context: AuthContext) => Promise<T>
): Promise<T> => {
  class LeadAgencyChanged extends Error {}
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const hint = await db.selectFrom('Applicant_Recipient_Profile')
      .where('id', '=', applicantRecipientId)
      .where('_deleted', '=', false)
      .select('egcs_ar_leadagency')
      .executeTakeFirst()
    if (!hint) return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
    try {
      return await db.transaction().execute(async trx => {
        const context = await requireFreshAuthContext(event, trx)
        // Agency deletion locks its parent row before it can revoke ownership.
        // Hold that row before locking the Proponent to preserve the lock order
        // used by lead-agency moves and reject a completed deletion.
        if (hint.egcs_ar_leadagency) {
          const agency = await trx.selectFrom('Agency_Profile')
            .where('id', '=', hint.egcs_ar_leadagency)
            .where('_deleted', '=', false)
            .select('id')
            .forShare()
            .executeTakeFirst()
          if (!agency) return await forbidden(event)
        }
        const profile = await trx.selectFrom('Applicant_Recipient_Profile').where('id', '=', applicantRecipientId)
          .where('_deleted', '=', false).select(['id', 'egcs_ar_leadagency']).forUpdate().executeTakeFirst()
        if (!profile) return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
        if (profile.egcs_ar_leadagency !== hint.egcs_ar_leadagency) throw new LeadAgencyChanged()
        await authorizeFreshAssignedItem(event, trx, context, 'applicantrecipient', applicantRecipientId, action)
        return await callback(trx, context)
      })
    } catch (error) {
      if (!(error instanceof LeadAgencyChanged)) throw error
      if (attempt === 2) {
        return await badRequest(event, 'APPLICANT_RECIPIENT_LEAD_AGENCY_CHANGED', 'apiErrors.request.invalid_status')
      }
    }
  }
  return await badRequest(event, 'APPLICANT_RECIPIENT_LEAD_AGENCY_CHANGED', 'apiErrors.request.invalid_status')
}
