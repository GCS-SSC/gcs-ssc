/* eslint-disable jsdoc/require-jsdoc -- Authorization helpers use explicit names and typed contracts. */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AbilityAction } from '~~/shared/utils/abilities'
import { notFound } from '~~/server/utils/api-errors'
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
  agencyId: string
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
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Applicant_Recipient_Profile.egcs_ar_leadagency')
    .where('Applicant_Recipient_Profile.id', 'in', uniqueIds)
    .where('Applicant_Recipient_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
    .select([
      'Applicant_Recipient_Profile.id as id',
      'Applicant_Recipient_Profile.egcs_ar_leadagency as agency_id'
    ]).execute()

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
    agencyId: String(row.agency_id),
    isAssigned: assignedIds.has(String(row.id))
  }]))
}

const allowsApplicantRecipientAction = (
  context: AuthContext,
  access: ApplicantRecipientAccess | undefined,
  action: AbilityAction
): boolean => access !== undefined
  && context.userAbilities.authorize('applicant_recipient', action, { type: 'agency', agencyId: access.agencyId })
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
  const access = await resolveApplicantRecipientAccess(context, db, [applicantRecipientId], action !== 'read')
  return allowsApplicantRecipientAction(context, access.get(String(applicantRecipientId)), action)
}

export const canAccessApplicantRecipientIds = async (
  context: AuthContext,
  applicantRecipientIds: string[],
  action: AbilityAction,
  db: Kysely<Database>
): Promise<boolean> => {
  const access = await resolveApplicantRecipientAccess(context, db, applicantRecipientIds, action !== 'read')
  return applicantRecipientIds.every(id => allowsApplicantRecipientAction(context, access.get(String(id)), action))
}

export const resolveApplicantRecipientMutationPermissions = async (
  context: AuthContext,
  applicantRecipientIds: string[],
  db: Kysely<Database>
): Promise<Map<string, { canCreate: boolean; canUpdate: boolean; canDelete: boolean }>> => {
  const access = await resolveApplicantRecipientAccess(context, db, applicantRecipientIds, true)
  return new Map(applicantRecipientIds.map(id => {
    const itemAccess = access.get(String(id))
    return [String(id), {
      canCreate: allowsApplicantRecipientAction(context, itemAccess, 'create'),
      canUpdate: allowsApplicantRecipientAction(context, itemAccess, 'update'),
      canDelete: allowsApplicantRecipientAction(context, itemAccess, 'delete')
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
): Promise<T> => await db.transaction().execute(async trx => {
  const context = await requireFreshAuthContext(event, trx)
  const profile = await trx.selectFrom('Applicant_Recipient_Profile').where('id', '=', applicantRecipientId)
    .where('_deleted', '=', false).select('id').forUpdate().executeTakeFirst()
  if (!profile) return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
  await authorizeFreshAssignedItem(event, trx, context, 'applicantrecipient', applicantRecipientId, action)
  return await callback(trx, context)
})
