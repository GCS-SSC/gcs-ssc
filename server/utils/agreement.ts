/* eslint-disable jsdoc/require-jsdoc -- Agreement authorization helpers expose typed contracts covered by focused tests. */
import type { H3Event } from 'h3'
import type { Insertable, Kysely, Transaction, Updateable } from 'kysely'
import {
  authorize,
  authorizeWithFreshAuthContext,
  requireFreshAuthContext,
  type AuthContext
} from './authorize'
import {
  getUserAssignmentAgencyScopes,
  resolveAssignedItemTargetGrant
} from './rbac'
import type {
  Agreement_Type,
  AssignableEntityType,
  Database,
  FundingCaseAgreementProfileTable
} from '~~/shared/types/database'
import type { Scope } from '~~/shared/utils/scopes'
import type {
  FundingCaseAgreementProfile,
  FundingCaseAgreementProfilePatch
} from '~~/shared/types/schemas'
import type { AbilityAction } from '~~/shared/utils/abilities'
import type { ExactEntityTarget } from '@gcs-ssc/authorization'
import { resolveAssignmentTargetAgreementId } from './agreement-assignment-target'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

type AgreementAction = Extract<AbilityAction, 'create' | 'read' | 'update' | 'delete'>
type AgreementDb = Kysely<Database> | Transaction<Database>

export interface AgreementStreamScopeContext {
  agencyId: string
  agencyNameEn: string
  agencyNameFr: string
  profileId: string
  programNameEn: string
  programNameFr: string
  streamId: string
  scope: Scope
}

export interface AgreementScopeContext extends AgreementStreamScopeContext {
  agreementId: string
  scope: Scope
}

export interface AgreementSubtypeContext {
  id: string
  agreementType: Agreement_Type
  streamId: string
  agreementNameEn?: string
  agreementNameFr?: string
}

export interface AgreementRiskRatingContext {
  id: string
  streamId: string
  riskScore: number
  nameEn?: string
  nameFr?: string
}

export interface VisibleAgreementOption {
  id: string
  agreementNumber: string
  label: string
}

export interface AgreementVisibility {
  hasGlobalAccess: boolean
  agencyIds: string[]
  transferPaymentIds: string[]
  agreementIds: string[]
}

/**
 * Resolves and authorizes an agreement without exposing inaccessible resource existence.
 *
 * @param event - Active request event.
 * @param action - Requested agreement action.
 * @param agreementId - Agreement identifier from the route.
 * @param db - Database used for canonical ownership and exact-assignment resolution.
 * @param options - Explicit optional authorization sources for the resource.
 * @param options.assignmentTarget - Exact assigned item whose grant may authorize this resource.
 * @param options.freshAuth - Rebuild the grant graph from the supplied transaction before authorizing.
 * @returns Authorized canonical context, or null for an authorized missing resource.
 */
export const authorizeAgreementResource = async (
  event: H3Event,
  action: AgreementAction,
  agreementId: string,
  db: AgreementDb,
  options: {
    assignmentTarget?: ExactEntityTarget<AssignableEntityType>
    freshAuth?: boolean
  } = {}
): Promise<AgreementScopeContext | null> => {
  const resolver = async ({ context }: { context: AuthContext }) => {
    const agreementContext = await resolveAgreementScopeContext(agreementId, db)
    if (!agreementContext) {
      return { scope: { type: 'global' } as Scope, data: null }
    }

    if (options.assignmentTarget) {
      if (!context.userAbilities.authorize('agreement', action, agreementContext.scope)) {
        return { denied: true as const, data: agreementContext }
      }
      if (action === 'read') return { bypass: true as const, data: agreementContext }
      const targetAgreementId = await resolveAssignmentTargetAgreementId(db, options.assignmentTarget)
      if (targetAgreementId === agreementId) {
        const grant = await resolveAssignedItemTargetGrant(context.userId, options.assignmentTarget, db)
        if (grant?.actions.has(action)) return { bypass: true as const, data: agreementContext }
      }
      return { denied: true as const, data: agreementContext }
    }

    const canAccess = await canAccessAgreement(context, action, agreementContext.scope, db)
    if (canAccess) return { bypass: true as const, data: agreementContext }
    return { denied: true as const, data: agreementContext }
  }
  const result = options.freshAuth
    ? await authorizeWithFreshAuthContext<AgreementAction, AgreementScopeContext | null>(
        event,
        await requireFreshAuthContext(event, db),
        'agreement',
        action,
        resolver
      )
    : await authorize<AgreementAction, AgreementScopeContext | null>(
        event,
        'agreement',
        action,
        resolver
      )

  return result.data ?? null
}

export const buildAgreementStreamScope = (
  agencyId: string,
  profileId: string,
  streamId: string
): Scope => {
  return {
    type: 'entity',
    agencyId,
    path: [
      { type: 'transfer_payment', id: profileId },
      { type: 'transfer_payment_stream', id: streamId }
    ]
  }
}

export const buildAgreementScope = (
  agencyId: string,
  profileId: string,
  streamId: string,
  agreementId: string
): Scope => {
  return {
    type: 'entity',
    agencyId,
    path: [
      { type: 'transfer_payment', id: profileId },
      { type: 'transfer_payment_stream', id: streamId },
      { type: 'fundingcaseagreement', id: agreementId }
    ]
  }
}

export const resolveAgreementStreamScopeContext = async (
  streamId: string,
  db: AgreementDb,
  options: { requireAvailable?: boolean } = {}
): Promise<AgreementStreamScopeContext | null> => {
  if (!isPositivePostgresBigintText(streamId)) return null
  let query = db
    .selectFrom('Transfer_Payment_Stream')
    .innerJoin(
      'Transfer_Payment_Profile',
      'Transfer_Payment_Profile.id',
      'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
    )
    .innerJoin(
      'Agency_Profile',
      'Agency_Profile.id',
      'Transfer_Payment_Profile.egcs_tp_agency'
    )
    .where('Transfer_Payment_Stream.id', '=', streamId)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)

  if (options.requireAvailable) {
    query = query
      .where('Transfer_Payment_Stream.egcs_tp_active', '=', true)
      .where('Transfer_Payment_Profile.egcs_tp_active', '=', true)
      .where('Agency_Profile.egcs_ay_active', '=', true)
  }

  const row = await query
    .select([
      'Transfer_Payment_Profile.egcs_tp_agency as agency_id',
      'Transfer_Payment_Profile.id as profile_id',
      'Transfer_Payment_Profile.egcs_tp_name_en as program_name_en',
      'Transfer_Payment_Profile.egcs_tp_name_fr as program_name_fr',
      'Agency_Profile.egcs_ay_name_en as agency_name_en',
      'Agency_Profile.egcs_ay_name_fr as agency_name_fr'
    ])
    .executeTakeFirst()

  if (!row?.agency_id || !row.profile_id) {
    return null
  }

  const agencyId = String(row.agency_id)
  const profileId = String(row.profile_id)

  return {
    agencyId,
    agencyNameEn: row.agency_name_en,
    agencyNameFr: row.agency_name_fr,
    profileId,
    programNameEn: row.program_name_en,
    programNameFr: row.program_name_fr,
    streamId,
    scope: buildAgreementStreamScope(agencyId, profileId, streamId)
  }
}

export const resolveAgreementScopeContext = async (
  agreementId: string,
  db: AgreementDb
): Promise<AgreementScopeContext | null> => {
  if (!isPositivePostgresBigintText(agreementId)) return null
  const row = await db
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
    .innerJoin(
      'Agency_Profile',
      'Agency_Profile.id',
      'Transfer_Payment_Profile.egcs_tp_agency'
    )
    .where('Funding_Case_Agreement_Profile.id', '=', agreementId)
    .where('Funding_Case_Agreement_Profile._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
    .select([
      'Funding_Case_Agreement_Profile.id as agreement_id',
      'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream as stream_id',
      'Transfer_Payment_Profile.egcs_tp_agency as agency_id',
      'Transfer_Payment_Profile.id as profile_id',
      'Transfer_Payment_Profile.egcs_tp_name_en as program_name_en',
      'Transfer_Payment_Profile.egcs_tp_name_fr as program_name_fr',
      'Agency_Profile.egcs_ay_name_en as agency_name_en',
      'Agency_Profile.egcs_ay_name_fr as agency_name_fr'
    ])
    .executeTakeFirst()

  if (!row?.agreement_id || !row.stream_id || !row.agency_id || !row.profile_id) {
    return null
  }

  const agencyId = String(row.agency_id)
  const profileId = String(row.profile_id)
  const streamId = String(row.stream_id)

  return {
    agreementId,
    agencyId,
    agencyNameEn: row.agency_name_en,
    agencyNameFr: row.agency_name_fr,
    profileId,
    programNameEn: row.program_name_en,
    programNameFr: row.program_name_fr,
    streamId,
    scope: buildAgreementScope(agencyId, profileId, streamId, agreementId)
  }
}

export const listVisibleAgreementOptions = async (
  context: AuthContext,
  action: Extract<AgreementAction, 'read' | 'update'>,
  streamId: string,
  db: AgreementDb
): Promise<VisibleAgreementOption[]> => {
  const resolvedStreamId = String(streamId)
  if (!isPositivePostgresBigintText(resolvedStreamId)) return []
  const agreements = await db
    .selectFrom('Funding_Case_Agreement_Profile')
    .select(['id', 'egcs_fc_agreementnumber'])
    .where('egcs_fc_transferpaymentstream', '=', resolvedStreamId)
    .where('_deleted', '=', false)
    .orderBy('egcs_fc_agreementnumber', 'asc')
    .orderBy('id', 'asc')
    .execute()
  const streamContext = await resolveAgreementStreamScopeContext(resolvedStreamId, db)
  if (!streamContext) return []
  const options = await Promise.all(agreements.map(async agreement => {
    const agreementId = String(agreement.id)
    const scope = buildAgreementScope(streamContext.agencyId, streamContext.profileId, resolvedStreamId, agreementId)
    if (!await canAccessAgreement(context, action, scope, db)) return null
    const agreementNumber = String(agreement.egcs_fc_agreementnumber)
    return { id: agreementId, agreementNumber, label: agreementNumber }
  }))
  return options.filter((option): option is VisibleAgreementOption => option !== null)
}

export const resolveAgreementSubtypeContext = async (
  agreementSubtypeId: string,
  streamId: string,
  db: AgreementDb
): Promise<AgreementSubtypeContext | null> => {
  const row = await db
    .selectFrom('Transfer_Payment_Agreement_Subtype')
    .innerJoin(
      'Agency_Agreement_Type',
      'Agency_Agreement_Type.id',
      'Transfer_Payment_Agreement_Subtype.egcs_tp_agreementtype'
    )
    .where('Transfer_Payment_Agreement_Subtype.id', '=', agreementSubtypeId)
    .where('Transfer_Payment_Agreement_Subtype.egcs_tp_transferpaymentstream', '=', streamId)
    .where('Transfer_Payment_Agreement_Subtype._deleted', '=', false)
    .where('Agency_Agreement_Type._deleted', '=', false)
    .select([
      'Transfer_Payment_Agreement_Subtype.id as id',
      'Transfer_Payment_Agreement_Subtype.egcs_tp_transferpaymentstream as stream_id',
      'Agency_Agreement_Type.egcs_ay_agreementtype as agreement_type',
      'Agency_Agreement_Type.egcs_ay_name_en as agreement_name_en',
      'Agency_Agreement_Type.egcs_ay_name_fr as agreement_name_fr'
    ])
    .executeTakeFirst()

  if (!row?.id || !row.stream_id || !row.agreement_type) {
    return null
  }

  return {
    id: String(row.id),
    streamId: String(row.stream_id),
    agreementType: row.agreement_type,
    agreementNameEn: row.agreement_name_en ?? undefined,
    agreementNameFr: row.agreement_name_fr ?? undefined
  }
}

export const resolveAgreementRiskRatingContext = async (
  riskScore: number,
  streamId: string,
  db: AgreementDb
): Promise<AgreementRiskRatingContext | null> => {
  const row = await db
    .selectFrom('Transfer_Payment_Stream_Risk_Rating')
    .where('egcs_tp_transferpaymentstream', '=', streamId)
    .where('egcs_tp_riskscore', '=', riskScore)
    .where('_deleted', '=', false)
    .select([
      'id',
      'egcs_tp_transferpaymentstream as stream_id',
      'egcs_tp_riskscore as risk_score',
      'egcs_tp_name_en as name_en',
      'egcs_tp_name_fr as name_fr'
    ])
    .executeTakeFirst()

  if (!row?.id || !row.stream_id || row.risk_score === undefined || row.risk_score === null) {
    return null
  }

  return {
    id: String(row.id),
    streamId: String(row.stream_id),
    riskScore: Number(row.risk_score),
    nameEn: row.name_en ?? undefined,
    nameFr: row.name_fr ?? undefined
  }
}

export const mapAgreementWriteValues = (
  input: FundingCaseAgreementProfile | FundingCaseAgreementProfilePatch,
  agreementType: Agreement_Type
): Insertable<FundingCaseAgreementProfileTable> | Updateable<FundingCaseAgreementProfileTable> => {
  const values: Partial<Insertable<FundingCaseAgreementProfileTable>> = {}

  if (Object.hasOwn(input, 'egcs_fc_agreementnumber')) {
    values.egcs_fc_agreementnumber = input.egcs_fc_agreementnumber
  }
  if (Object.hasOwn(input, 'egcs_fc_transferpaymentstream')) {
    values.egcs_fc_transferpaymentstream = String(input.egcs_fc_transferpaymentstream)
  }
  if (Object.hasOwn(input, 'egcs_fc_financialsystemnumber')) {
    values.egcs_fc_financialsystemnumber = String(input.egcs_fc_financialsystemnumber)
  }
  if (Object.hasOwn(input, 'egcs_fc_title_en')) {
    values.egcs_fc_title_en = input.egcs_fc_title_en
  }
  if (Object.hasOwn(input, 'egcs_fc_title_fr')) {
    values.egcs_fc_title_fr = input.egcs_fc_title_fr
  }
  if (Object.hasOwn(input, 'egcs_fc_description_en')) {
    values.egcs_fc_description_en = input.egcs_fc_description_en
  }
  if (Object.hasOwn(input, 'egcs_fc_description_fr')) {
    values.egcs_fc_description_fr = input.egcs_fc_description_fr
  }
  if (Object.hasOwn(input, 'egcs_fc_agreementsubtype')) {
    values.egcs_fc_agreementsubtype = String(input.egcs_fc_agreementsubtype)
  }
  if (Object.hasOwn(input, 'egcs_fc_furtherdistribution')) {
    values.egcs_fc_furtherdistribution = input.egcs_fc_furtherdistribution
  }
  if (Object.hasOwn(input, 'egcs_fc_holdback')) {
    values.egcs_fc_holdback = input.egcs_fc_holdback
  }
  if (Object.hasOwn(input, 'egcs_fc_holdbackbasis')) {
    values.egcs_fc_holdbackbasis = String(input.egcs_fc_holdbackbasis)
  }
  if (Object.hasOwn(input, 'egcs_fc_riskscore')) {
    values.egcs_fc_riskscore = input.egcs_fc_riskscore ?? null
  }
  if (Object.hasOwn(input, 'egcs_fc_authorizedassistancestartdate')) {
    values.egcs_fc_authorizedassistancestartdate = input.egcs_fc_authorizedassistancestartdate
  }
  if (Object.hasOwn(input, 'egcs_fc_authorizedassistanceenddate')) {
    values.egcs_fc_authorizedassistanceenddate = input.egcs_fc_authorizedassistanceenddate
  }

  values.egcs_fc_agreementtype = agreementType

  return values as Insertable<FundingCaseAgreementProfileTable> | Updateable<FundingCaseAgreementProfileTable>
}

export const isAgreementHoldbackBasisValid = async (
  basisId: string,
  streamId: string,
  db: AgreementDb
): Promise<boolean> => Boolean(await db
  .selectFrom('Transfer_Payment_Stream_Holdback_Basis')
  .innerJoin('Agency_Holdback_Basis', 'Agency_Holdback_Basis.id', 'Transfer_Payment_Stream_Holdback_Basis.egcs_tp_agencyholdback')
  .where('Transfer_Payment_Stream_Holdback_Basis.id', '=', basisId)
  .where('Transfer_Payment_Stream_Holdback_Basis.egcs_tp_transferpaymentstream', '=', streamId)
  .where('Transfer_Payment_Stream_Holdback_Basis._deleted', '=', false)
  .where('Agency_Holdback_Basis._deleted', '=', false)
  .select('Transfer_Payment_Stream_Holdback_Basis.id').executeTakeFirst())

const getRoleScopedTransferPaymentIds = async (
  context: AuthContext,
  action: AgreementAction,
  db: AgreementDb
): Promise<string[]> => {
  const rows = await db
    .selectFrom('user_role_assignment')
    .innerJoin('role', 'role.id', 'user_role_assignment.role_id')
    .innerJoin('role_transfer_payment_scope', 'role_transfer_payment_scope.role_id', 'role.id')
    .where('user_role_assignment.user_id', '=', context.userId)
    .where('user_role_assignment._deleted', '=', false)
    .where('role._deleted', '=', false)
    .where('role_transfer_payment_scope._deleted', '=', false)
    .select([
      'role.agency_id as agency_id',
      'role_transfer_payment_scope.transfer_payment_profile_id as transfer_payment_id'
    ])
    .execute()

  const transferPaymentIds = new Set<string>()

  for (const row of rows) {
    if (!row.agency_id || !row.transfer_payment_id) {
      continue
    }

    const agencyId = String(row.agency_id)
    const transferPaymentId = String(row.transfer_payment_id)
    if (context.userAbilities.authorize('agreement', action, {
      type: 'program',
      agencyId,
      transferPaymentId
    })) {
      transferPaymentIds.add(transferPaymentId)
    }
  }

  return [...transferPaymentIds]
}

export const resolveAgreementVisibility = async (
  context: AuthContext,
  action: AgreementAction,
  db: AgreementDb
): Promise<AgreementVisibility> => {
  if (context.userAbilities.authorize('agreement', action, { type: 'global' })) {
    return {
      hasGlobalAccess: true,
      agencyIds: [],
      transferPaymentIds: [],
      agreementIds: []
    }
  }

  const [assignmentScopes, roleScopedTransferPaymentIds] = await Promise.all([
    getUserAssignmentAgencyScopes(context.userId, db),
    getRoleScopedTransferPaymentIds(context, action, db)
  ])

  const agencyIds = assignmentScopes
    .map(scope => scope.agencyId)
    .filter(agencyId => context.userAbilities.authorize('agreement', action, { type: 'agency', agencyId }))

  return {
    hasGlobalAccess: false,
    agencyIds: [...new Set(agencyIds)],
    transferPaymentIds: [...new Set(roleScopedTransferPaymentIds)],
    agreementIds: []
  }
}

export const canAccessAgreementStream = async (
  context: AuthContext,
  action: AgreementAction,
  scope: Scope,
  _db: AgreementDb
): Promise<boolean> => {
  return context.userAbilities.authorize('agreement', action, scope)
}

export const canAccessAgreement = async (
  context: AuthContext,
  action: AgreementAction,
  scope: Scope,
  db: AgreementDb
): Promise<boolean> => {
  if (!context.userAbilities.authorize('agreement', action, scope)) return false
  if (action === 'read') return true
  if (scope.type !== 'entity') return false
  const [programNode, streamNode, agreementNode] = scope.path
  const agreementNodeCount = scope.path.filter(node => node.type === 'fundingcaseagreement').length
  if (
    programNode?.type !== 'transfer_payment'
    || streamNode?.type !== 'transfer_payment_stream'
    || agreementNode?.type !== 'fundingcaseagreement'
    || agreementNodeCount !== 1
  ) return false
  const grant = await resolveAssignedItemTargetGrant(context.userId, {
    entityType: 'fundingcaseagreement',
    entityId: String(agreementNode.id)
  }, db)
  return grant?.actions.has(action) === true
}

export interface AgreementPageScope {
  agreementId: string
  agencyId: string
  programId: string
  streamId: string
}

export const resolveAgreementPageMutationPermissions = async (
  context: AuthContext,
  items: AgreementPageScope[],
  db: AgreementDb
): Promise<Map<string, { canUpdate: boolean; canDelete: boolean }>> => {
  if (items.length === 0) return new Map()
  const ids = [...new Set(items.map(item => item.agreementId))]
  const assignments = await db.selectFrom('user')
    .innerJoin('Common_User', 'Common_User.egcs_cn_auth_user_id', 'user.id')
    .innerJoin('Common_Entity_Assignment', 'Common_Entity_Assignment.egcs_cn_user', 'Common_User.id')
    .innerJoin('Common_Entity', join => join
      .onRef('Common_Entity.id', '=', 'Common_Entity_Assignment.egcs_cn_entityid')
      .onRef('Common_Entity.egcs_cn_entitytype', '=', 'Common_Entity_Assignment.egcs_cn_entitytype'))
    .select('Common_Entity_Assignment.egcs_cn_entityid as agreement_id')
    .where('user.id', '=', context.userId).where('user._deleted', '=', false)
    .where('Common_User._deleted', '=', false).where('Common_Entity._deleted', '=', false)
    .where('Common_Entity_Assignment.egcs_cn_entitytype', '=', 'fundingcaseagreement')
    .where('Common_Entity_Assignment.egcs_cn_entityid', 'in', ids)
    .where('Common_Entity_Assignment._deleted', '=', false).execute()
  const assigned = new Set(assignments.map(row => String(row.agreement_id)))
  return new Map(items.map(item => {
    const scope = buildAgreementScope(item.agencyId, item.programId, item.streamId, item.agreementId)
    return [item.agreementId, {
      canUpdate: assigned.has(item.agreementId) && context.userAbilities.authorize('agreement', 'update', scope),
      canDelete: assigned.has(item.agreementId) && context.userAbilities.authorize('agreement', 'delete', scope)
    }]
  }))
}
