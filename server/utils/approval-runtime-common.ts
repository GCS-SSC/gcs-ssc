/* eslint-disable jsdoc/require-jsdoc */
import type { H3Event } from 'h3'
import { sql, type Kysely, type Selectable, type Transaction } from 'kysely'
import { badRequest, forbidden, notFound } from '~~/server/utils/api-errors'
import { listAgencyScopedCommonUsers, resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import type { Database } from '~~/shared/types/database'
import type { AddApprovalStepInput } from '~~/shared/types/schemas/review-approval'
import type { RuntimeState } from '~~/shared/constants/system-lifecycle'
import { RUNTIME_TERMINAL_STATES } from '~~/shared/constants/system-lifecycle'
import { createRuntimeItem, transitionRuntimeItem } from './system-runtime'

export class ApprovalTemplatePublicationMissingError extends Error {
  constructor(public readonly approvalTemplateId: string) {
    super(`Approval template ${approvalTemplateId} does not have a published version`)
    this.name = 'ApprovalTemplatePublicationMissingError'
  }
}

export type ApprovalRuntimeDbClient = Kysely<Database> | Transaction<Database>

export type RuntimeApprovalRow = {
  id: string
  egcs_cn_sequence: number
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_defaultuser: string
  egcs_cn_assigneduser: string | null | undefined
  egcs_cn_onbehalf: string | null | undefined
  egcs_cn_approvalpositiontitle: string | null | undefined
  egcs_cn_isadded: boolean
  egcs_cn_approvalvalue: boolean | null | undefined
  egcs_cn_approvaldate: string | Date | null | undefined
  egcs_cn_attachment: string | null | undefined
  egcs_cn_comment: string | null | undefined
  default_user_name: string
  default_user_position_title: string | null
  assigned_user_name: string | null
  assigned_user_position_title: string | null
  onbehalf_name_en: string | null
  onbehalf_name_fr: string | null
  onbehalf_require_actual: boolean | null
  runtimeItemId: string
  runtimeState: RuntimeState
}

export type RuntimeApprovalCertificationRow = {
  id: string
  egcs_cn_optional: boolean
  egcs_cn_certification_en: string
  egcs_cn_certification_fr: string
  egcs_cn_value: boolean | null | undefined
  egcs_cn_approval: string
}

type RuntimeRoutingSlipStatus = RuntimeState

type BuildRuntimeApprovalStepsOptions = {
  approvals: RuntimeApprovalRow[]
  certificationsByApprovalId: Map<string, RuntimeApprovalCertificationRow[]>
  routingSlipStatus: RuntimeRoutingSlipStatus
  currentCommonUserId: string | null
  canManage: boolean
  isTerminal: boolean
  canReassignTerminal?: boolean
  allowAdditionalApprovals?: boolean
}

type RuntimeApprovalStepAccessOptions = {
  approval: RuntimeApprovalRow
  currentPendingApprovalId: string | null
  currentCommonUserId: string | null
  canManage: boolean
  isTerminal: boolean
  isLocked: boolean
  canReassignTerminal: boolean
  canAddApprovalSteps?: boolean
  maxActionedSequence?: number | null
}

export const LOCKED_ROUTING_SLIP_STATUSES: ReadonlySet<RuntimeState> = RUNTIME_TERMINAL_STATES

export const normalizeId = (value: string | number | bigint | null | undefined) =>
  value === null || value === undefined ? null : String(value)

export const getCurrentApprovalRoutingSlip = <TRoutingSlip extends { routingSlipState: RuntimeState }>(
  routingSlips: TRoutingSlip[]
) => routingSlips.find(routingSlip => !RUNTIME_TERMINAL_STATES.has(routingSlip.routingSlipState)) ?? routingSlips[0] ?? null

export const getCurrentPendingApprovalId = (approvals: RuntimeApprovalRow[]): string | null => {
  const ordered = approvals
    .slice()
    .sort((left, right) => left.egcs_cn_sequence - right.egcs_cn_sequence)

  for (const approval of ordered) {
    if (approval.egcs_cn_approvalvalue === null && approval.runtimeState === 'awaiting_action') {
      return approval.id
    }
  }

  return null
}

export const getRuntimeApprovals = async (
  db: ApprovalRuntimeDbClient,
  routingSlipId: string
) => {
  const approvalRows = await db
    .selectFrom('Common_Approval')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Approval.egcs_cn_runtimeitem')
    .innerJoin('Common_User as DefaultUser', 'DefaultUser.id', 'Common_Approval.egcs_cn_defaultuser')
    .leftJoin('Common_User as AssignedUser', 'AssignedUser.id', 'Common_Approval.egcs_cn_assigneduser')
    .leftJoin('Agency_Approval_Behalf_Type', 'Agency_Approval_Behalf_Type.id', 'Common_Approval.egcs_cn_onbehalf')
    .select([
      'Common_Approval.id as id',
      'Common_Approval.egcs_cn_sequence as egcs_cn_sequence',
      'Common_Approval.egcs_cn_name_en as egcs_cn_name_en',
      'Common_Approval.egcs_cn_name_fr as egcs_cn_name_fr',
      'Common_Approval.egcs_cn_defaultuser as egcs_cn_defaultuser',
      'Common_Approval.egcs_cn_assigneduser as egcs_cn_assigneduser',
      'Common_Approval.egcs_cn_onbehalf as egcs_cn_onbehalf',
      'Common_Approval.egcs_cn_approvalpositiontitle as egcs_cn_approvalpositiontitle',
      'Common_Approval.egcs_cn_isadded as egcs_cn_isadded',
      'Common_Approval.egcs_cn_approvalvalue as egcs_cn_approvalvalue',
      'Common_Approval.egcs_cn_approvaldate as egcs_cn_approvaldate',
      'Common_Approval.egcs_cn_attachment as egcs_cn_attachment',
      'Common_Approval.egcs_cn_comment as egcs_cn_comment',
      'DefaultUser.egcs_cn_name as default_user_name',
      'DefaultUser.egcs_cn_position_title as default_user_position_title',
      'AssignedUser.egcs_cn_name as assigned_user_name',
      'AssignedUser.egcs_cn_position_title as assigned_user_position_title',
      'Agency_Approval_Behalf_Type.egcs_ay_name_en as onbehalf_name_en',
      'Agency_Approval_Behalf_Type.egcs_ay_name_fr as onbehalf_name_fr',
      'Agency_Approval_Behalf_Type.egcs_ay_require_actual as onbehalf_require_actual',
      'Common_Runtime_Item.id as runtimeItemId',
      'Common_Runtime_Item.egcs_cn_state as runtimeState'
    ])
    .where('Common_Approval.egcs_cn_routingslip', '=', routingSlipId)
    .where('Common_Runtime_Item._deleted', '=', false)
    .where('DefaultUser._deleted', '=', false)
    .orderBy('Common_Approval.egcs_cn_sequence', 'asc')
    .orderBy('Common_Approval.id', 'asc')
    .execute()

  const approvals: RuntimeApprovalRow[] = approvalRows.map(approval => ({
    ...approval,
    id: String(approval.id),
    egcs_cn_defaultuser: String(approval.egcs_cn_defaultuser),
    egcs_cn_assigneduser: normalizeId(approval.egcs_cn_assigneduser),
    egcs_cn_onbehalf: normalizeId(approval.egcs_cn_onbehalf),
    egcs_cn_attachment: normalizeId(approval.egcs_cn_attachment),
    runtimeItemId: String(approval.runtimeItemId)
  }))

  const approvalIds = approvals.map(approval => approval.id)
  const certificationRows = approvalIds.length === 0
    ? []
    : await db
        .selectFrom('Common_Approval_Certification')
        .selectAll()
        .where('egcs_cn_approval', 'in', approvalIds)
        .orderBy('id', 'asc')
        .execute()

  const certifications: RuntimeApprovalCertificationRow[] = certificationRows.map(certification => ({
    ...certification,
    id: String(certification.id),
    egcs_cn_approval: String(certification.egcs_cn_approval)
  }))

  const certificationsByApprovalId = new Map<string, RuntimeApprovalCertificationRow[]>()
  for (const certification of certifications) {
    const approvalId = String(certification.egcs_cn_approval)
    const rows = certificationsByApprovalId.get(approvalId)
    if (rows) {
      rows.push(certification)
      continue
    }

    certificationsByApprovalId.set(approvalId, [certification])
  }

  return {
    approvals,
    certificationsByApprovalId
  }
}

const formatApprovalDate = (value: string | Date | null | undefined): string | null => {
  return value ? new Date(value).toISOString() : null
}

const canActionRuntimeApprovalStep = ({
  approval,
  currentPendingApprovalId,
  currentCommonUserId,
  isTerminal,
  isLocked
}: RuntimeApprovalStepAccessOptions): boolean => {
  return approval.id === currentPendingApprovalId
    && approval.egcs_cn_approvalvalue === null
    && approval.runtimeState === 'awaiting_action'
    && currentCommonUserId !== null
    && approval.egcs_cn_assigneduser === currentCommonUserId
    && !isTerminal
    && !isLocked
}

const canReassignRuntimeApprovalStep = ({
  approval,
  canManage,
  isTerminal,
  isLocked,
  canReassignTerminal
}: RuntimeApprovalStepAccessOptions): boolean => {
  return approval.egcs_cn_approvalvalue === null
    && !RUNTIME_TERMINAL_STATES.has(approval.runtimeState)
    && canManage
    && (canReassignTerminal || !isTerminal)
    && !isLocked
}

const canAddRuntimeApprovalStepBefore = ({
  approval,
  canAddApprovalSteps = false,
  isTerminal,
  isLocked
}: RuntimeApprovalStepAccessOptions): boolean => canAddApprovalSteps
  && approval.egcs_cn_approvalvalue === null
  && !RUNTIME_TERMINAL_STATES.has(approval.runtimeState)
  && !isTerminal
  && !isLocked

const canAddRuntimeApprovalStepAfter = ({
  approval,
  canAddApprovalSteps = false,
  maxActionedSequence = null,
  isTerminal,
  isLocked
}: RuntimeApprovalStepAccessOptions): boolean => canAddApprovalSteps
  && !RUNTIME_TERMINAL_STATES.has(approval.runtimeState)
  && (maxActionedSequence === null || approval.egcs_cn_sequence >= maxActionedSequence)
  && !isTerminal
  && !isLocked

const formatRuntimeApprovalCertifications = (
  certifications: RuntimeApprovalCertificationRow[]
) => certifications.map(certification => ({
  id: String(certification.id),
  egcs_cn_optional: certification.egcs_cn_optional,
  egcs_cn_certification_en: certification.egcs_cn_certification_en,
  egcs_cn_certification_fr: certification.egcs_cn_certification_fr,
  egcs_cn_value: certification.egcs_cn_value ?? null
}))

export const buildRuntimeApprovalSteps = ({
  approvals,
  certificationsByApprovalId,
  routingSlipStatus,
  currentCommonUserId,
  canManage,
  isTerminal,
  canReassignTerminal = false,
  allowAdditionalApprovals = false
}: BuildRuntimeApprovalStepsOptions) => {
  const isLocked = LOCKED_ROUTING_SLIP_STATUSES.has(routingSlipStatus)
  const currentPendingApprovalId = isLocked ? null : getCurrentPendingApprovalId(approvals)
  const isAssignedToUnresolvedApproval = currentCommonUserId !== null
    && approvals.some(approval => approval.egcs_cn_approvalvalue === null
      && approval.egcs_cn_assigneduser === currentCommonUserId)
  const canAddApprovalSteps = allowAdditionalApprovals
    && (canManage || isAssignedToUnresolvedApproval)
    && routingSlipStatus !== 'approved'
    && routingSlipStatus !== 'denied'
  const maxActionedSequence = approvals.reduce<number | null>((maximum, approval) => {
    if (approval.egcs_cn_approvalvalue === null) return maximum
    if (maximum === null || approval.egcs_cn_sequence > maximum) return approval.egcs_cn_sequence
    return maximum
  }, null)

  return approvals.map((approval, index) => ({
    id: approval.id,
    sequence: approval.egcs_cn_sequence,
    display_order: index + 1,
    egcs_cn_name_en: approval.egcs_cn_name_en,
    egcs_cn_name_fr: approval.egcs_cn_name_fr,
    egcs_cn_defaultuser: approval.egcs_cn_defaultuser,
    egcs_cn_assigneduser: approval.egcs_cn_assigneduser,
    egcs_cn_onbehalf: approval.egcs_cn_onbehalf,
    egcs_cn_approvalpositiontitle: approval.egcs_cn_approvalpositiontitle ?? '',
    egcs_cn_isadded: approval.egcs_cn_isadded,
    egcs_cn_approvalvalue: approval.egcs_cn_approvalvalue,
    egcs_cn_approvaldate: formatApprovalDate(approval.egcs_cn_approvaldate),
    egcs_cn_attachment: approval.egcs_cn_attachment,
    egcs_cn_comment: approval.egcs_cn_comment ?? '',
    runtimeItemId: approval.runtimeItemId,
    runtimeState: approval.runtimeState,
    default_user_name: approval.default_user_name,
    default_user_position_title: approval.default_user_position_title ?? '',
    assigned_user_name: approval.assigned_user_name ?? '',
    assigned_user_position_title: approval.assigned_user_position_title ?? '',
    onbehalf_name_en: approval.onbehalf_name_en ?? '',
    onbehalf_name_fr: approval.onbehalf_name_fr ?? '',
    onbehalf_require_actual: approval.onbehalf_require_actual === true,
    is_current: approval.id === currentPendingApprovalId,
    can_action: canActionRuntimeApprovalStep({
      approval,
      currentPendingApprovalId,
      currentCommonUserId,
      canManage,
      isTerminal,
      isLocked,
      canReassignTerminal
    }),
    can_reassign: canReassignRuntimeApprovalStep({
      approval,
      currentPendingApprovalId,
      currentCommonUserId,
      canManage,
      isTerminal,
      isLocked,
      canReassignTerminal
    }),
    can_add_before: canAddRuntimeApprovalStepBefore({
      approval,
      currentPendingApprovalId,
      currentCommonUserId,
      canManage,
      isTerminal,
      isLocked,
      canReassignTerminal,
      canAddApprovalSteps,
      maxActionedSequence
    }),
    can_add_after: canAddRuntimeApprovalStepAfter({
      approval,
      currentPendingApprovalId,
      currentCommonUserId,
      canManage,
      isTerminal,
      isLocked,
      canReassignTerminal,
      canAddApprovalSteps,
      maxActionedSequence
    }),
    certifications: formatRuntimeApprovalCertifications(certificationsByApprovalId.get(approval.id) ?? [])
  }))
}

export const getRuntimeAdditionalApprovalPolicy = async (
  db: ApprovalRuntimeDbClient,
  routingSlip: Selectable<Database['Common_Routing_Slip']>
) => {
  const certifications = await db
    .selectFrom('Common_Certification')
    .select([
      'egcs_cn_order',
      'egcs_cn_description_en',
      'egcs_cn_description_fr',
      'egcs_cn_name_en',
      'egcs_cn_name_fr',
      'egcs_cn_optional',
      'egcs_cn_certification_en',
      'egcs_cn_certification_fr'
    ])
    .where('egcs_cn_routingslip', '=', String(routingSlip.id))
    .where('_deleted', '=', false)
    .orderBy('egcs_cn_order', 'asc')
    .orderBy('id', 'asc')
    .execute()

  return {
    allow_additional_approvals: routingSlip.egcs_cn_allowadditionalapprovals,
    default_added_approval_name_en: routingSlip.egcs_cn_defaultaddedapprovalname_en ?? '',
    default_added_approval_name_fr: routingSlip.egcs_cn_defaultaddedapprovalname_fr ?? '',
    allow_added_approval_name_changes: routingSlip.egcs_cn_allowaddedapprovalnamechanges,
    allow_added_approval_certification_changes: routingSlip.egcs_cn_allowaddedapprovalcertificationchanges,
    additional_approval_certifications: certifications
  }
}

export const canCurrentUserAddApprovalStep = async (
  event: H3Event,
  entityType: Database['Common_Routing_Slip']['egcs_cn_entitytype'],
  entityId: string
): Promise<boolean> => {
  const currentCommonUser = await resolveCurrentCommonUser(event)
  if (!currentCommonUser) return false

  const assignedApproval = await event.context.$db
    .selectFrom('Common_Approval')
    .innerJoin('Common_Routing_Slip', 'Common_Routing_Slip.id', 'Common_Approval.egcs_cn_routingslip')
    .innerJoin('Common_Runtime_Item as Routing_Item', 'Routing_Item.id', 'Common_Routing_Slip.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime_Item as Approval_Item', 'Approval_Item.id', 'Common_Approval.egcs_cn_runtimeitem')
    .select('Common_Approval.id')
    .where('Common_Routing_Slip.egcs_cn_entitytype', '=', entityType)
    .where('Common_Routing_Slip.egcs_cn_entityid', '=', entityId)
    .where('Routing_Item.egcs_cn_state', '=', 'awaiting_action')
    .where('Approval_Item.egcs_cn_state', '=', 'awaiting_action')
    .where('Common_Routing_Slip.egcs_cn_allowadditionalapprovals', '=', true)
    .where('Common_Routing_Slip._deleted', '=', false)
    .where('Common_Approval.egcs_cn_assigneduser', '=', currentCommonUser.id)
    .where('Common_Approval.egcs_cn_approvalvalue', 'is', null)
    .executeTakeFirst()

  return Boolean(assignedApproval)
}

export const addRuntimeApprovalStep = async (
  event: H3Event,
  trx: Transaction<Database>,
  body: AddApprovalStepInput,
  schemaAgencyId: string,
  canManage: boolean
) => {
  const anchorApprovalId = String(body.anchorApprovalId)
  const routingSlip = await trx
    .selectFrom('Common_Routing_Slip')
    .innerJoin('Common_Approval', 'Common_Approval.egcs_cn_routingslip', 'Common_Routing_Slip.id')
    .innerJoin('Common_Runtime_Item as Routing_Item', 'Routing_Item.id', 'Common_Routing_Slip.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Routing_Item.egcs_cn_runtime')
    .selectAll('Common_Routing_Slip')
    .select([
      'Common_Runtime.id as runtimeId',
      'Routing_Item.id as routingRuntimeItemId',
      'Routing_Item.egcs_cn_state as routingState',
      'Routing_Item.egcs_cn_publication as publicationId',
      'Routing_Item.egcs_cn_publicationkind as publicationKind',
      'Routing_Item.egcs_cn_publicationversion as publicationVersionId',
      'Routing_Item.egcs_cn_version as publicationVersion'
    ])
    .where('Common_Approval.id', '=', anchorApprovalId)
    .where('Common_Routing_Slip.egcs_cn_entitytype', '=', body.entityType)
    .where('Common_Routing_Slip.egcs_cn_entityid', '=', body.entityId)
    .where('Common_Routing_Slip._deleted', '=', false)
    .forUpdate('Common_Routing_Slip')
    .executeTakeFirst()
  if (!routingSlip) {
    return await notFound(event, 'APPROVAL_STEP_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  if (!routingSlip.egcs_cn_allowadditionalapprovals) {
    return await badRequest(event, 'ADDITIONAL_APPROVALS_DISABLED', 'apiErrors.request.invalid')
  }
  if (RUNTIME_TERMINAL_STATES.has(routingSlip.routingState)) {
    return await badRequest(event, 'APPROVAL_ROUTING_SLIP_TERMINAL', 'apiErrors.request.invalid_status')
  }

  const approvals = await trx
    .selectFrom('Common_Approval')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Approval.egcs_cn_runtimeitem')
    .select([
      'Common_Approval.id', 'Common_Approval.egcs_cn_sequence', 'Common_Approval.egcs_cn_assigneduser',
      'Common_Approval.egcs_cn_approvalvalue', 'Common_Runtime_Item.id as runtimeItemId',
      'Common_Runtime_Item.egcs_cn_state as runtimeState'
    ])
    .where('egcs_cn_routingslip', '=', String(routingSlip.id))
    .orderBy('egcs_cn_sequence', 'asc')
    .orderBy('id', 'asc')
    .forUpdate()
    .execute()
  const anchor = approvals.find(approval => String(approval.id) === anchorApprovalId)
  if (!anchor) {
    return await notFound(event, 'APPROVAL_STEP_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  if (body.position === 'before' && anchor.egcs_cn_approvalvalue !== null) {
    return await badRequest(event, 'ADDITIONAL_APPROVAL_BEFORE_ACTIONED', 'apiErrors.request.invalid_status')
  }
  const currentAwaitingApproval = approvals.find(approval => approval.runtimeState === 'awaiting_action')

  const currentCommonUser = await resolveCurrentCommonUser(event, trx)
  const actorId = currentCommonUser?.id ?? null
  if (!actorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const assignedToUnresolvedStep = currentCommonUser !== null && approvals.some(approval =>
    approval.egcs_cn_approvalvalue === null
    && normalizeId(approval.egcs_cn_assigneduser) === currentCommonUser.id)
  if (!canManage && !assignedToUnresolvedStep) {
    return await forbidden(event)
  }

  const maxActionedSequence = approvals.reduce<number | null>((maximum, approval) => {
    if (approval.egcs_cn_approvalvalue === null) return maximum
    const sequence = Number(approval.egcs_cn_sequence)
    if (maximum === null || sequence > maximum) return sequence
    return maximum
  }, null)
  if (body.position === 'after'
    && maxActionedSequence !== null
    && Number(anchor.egcs_cn_sequence) < maxActionedSequence) {
    return await badRequest(event, 'ADDITIONAL_APPROVAL_BEFORE_ACTIONED', 'apiErrors.request.invalid_status')
  }

  const agencyUsers = await listAgencyScopedCommonUsers(trx, schemaAgencyId)
  if (!agencyUsers.some(user => user.id === body.egcs_cn_assigneduser)) {
    return await badRequest(event, 'ADDITIONAL_APPROVAL_USER_OUTSIDE_AGENCY', 'apiErrors.request.invalid')
  }
  if (!routingSlip.egcs_cn_allowaddedapprovalnamechanges
    && (body.egcs_cn_name_en !== undefined || body.egcs_cn_name_fr !== undefined)) {
    return await badRequest(event, 'ADDITIONAL_APPROVAL_NAME_CHANGES_DISABLED', 'apiErrors.request.invalid')
  }
  if (!routingSlip.egcs_cn_allowaddedapprovalcertificationchanges && body.certifications !== undefined) {
    return await badRequest(event, 'ADDITIONAL_APPROVAL_CERTIFICATION_CHANGES_DISABLED', 'apiErrors.request.invalid')
  }

  const defaultCertifications = await trx
    .selectFrom('Common_Certification')
    .select([
      'egcs_cn_order',
      'egcs_cn_description_en',
      'egcs_cn_description_fr',
      'egcs_cn_name_en',
      'egcs_cn_name_fr',
      'egcs_cn_optional',
      'egcs_cn_certification_en',
      'egcs_cn_certification_fr'
    ])
    .where('egcs_cn_routingslip', '=', String(routingSlip.id))
    .where('_deleted', '=', false)
    .orderBy('egcs_cn_order', 'asc')
    .orderBy('id', 'asc')
    .execute()
  const certifications = body.certifications === undefined ? defaultCertifications : body.certifications
  const anchorId = anchorApprovalId
  const routingSlipId = String(routingSlip.id)
  const sequenceExpression = body.position === 'before'
    ? sql<number>`(
        SELECT COALESCE(
          (previous.egcs_cn_sequence + anchor.egcs_cn_sequence) / 2,
          anchor.egcs_cn_sequence - 1
        )
        FROM "Common_Approval" anchor
        LEFT JOIN LATERAL (
          SELECT candidate.egcs_cn_sequence
          FROM "Common_Approval" candidate
          WHERE candidate.egcs_cn_routingslip = ${routingSlipId}
            AND candidate.egcs_cn_sequence < anchor.egcs_cn_sequence
          ORDER BY candidate.egcs_cn_sequence DESC
          LIMIT 1
        ) previous ON true
        WHERE anchor.id = ${anchorId}
      )`
    : sql<number>`(
        SELECT COALESCE(
          (anchor.egcs_cn_sequence + following.egcs_cn_sequence) / 2,
          anchor.egcs_cn_sequence + 1
        )
        FROM "Common_Approval" anchor
        LEFT JOIN LATERAL (
          SELECT candidate.egcs_cn_sequence
          FROM "Common_Approval" candidate
          WHERE candidate.egcs_cn_routingslip = ${routingSlipId}
            AND candidate.egcs_cn_sequence > anchor.egcs_cn_sequence
          ORDER BY candidate.egcs_cn_sequence ASC
          LIMIT 1
        ) following ON true
        WHERE anchor.id = ${anchorId}
      )`

  const approval = await trx
    .selectFrom('Common_Runtime_Item')
    .select(eb => eb.fn.max('egcs_cn_order').as('maximum'))
    .where('egcs_cn_runtime', '=', String(routingSlip.runtimeId))
    .where('egcs_cn_parentruntimeitem', '=', String(routingSlip.routingRuntimeItemId))
    .executeTakeFirst()
  const runtimeItemId = await createRuntimeItem(trx, {
    egcs_cn_runtime: String(routingSlip.runtimeId),
    egcs_cn_parentruntimeitem: String(routingSlip.routingRuntimeItemId),
    egcs_cn_kind: 'approval_step',
    egcs_cn_order: Number(approval?.maximum ?? 0) + 1,
    egcs_cn_publication: String(routingSlip.publicationId),
    egcs_cn_publicationkind: routingSlip.publicationKind,
    egcs_cn_publicationversion: String(routingSlip.publicationVersionId),
    egcs_cn_version: Number(routingSlip.publicationVersion)
  })
  const createdApproval = await trx
    .insertInto('Common_Approval')
    .values({
      egcs_cn_runtimeitem: runtimeItemId,
      egcs_cn_sequence: sequenceExpression,
      egcs_cn_name_en: body.egcs_cn_name_en ?? routingSlip.egcs_cn_defaultaddedapprovalname_en ?? '',
      egcs_cn_name_fr: body.egcs_cn_name_fr ?? routingSlip.egcs_cn_defaultaddedapprovalname_fr ?? '',
      egcs_cn_routingslip: routingSlipId,
      egcs_cn_defaultuser: body.egcs_cn_assigneduser,
      egcs_cn_assigneduser: body.egcs_cn_assigneduser,
      egcs_cn_isadded: true
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  if (certifications.length > 0) {
    await trx
      .insertInto('Common_Approval_Certification')
      .values(certifications.map(certification => ({
        egcs_cn_optional: certification.egcs_cn_optional === true,
        egcs_cn_certification_en: certification.egcs_cn_certification_en,
        egcs_cn_certification_fr: certification.egcs_cn_certification_fr,
        egcs_cn_approval: String(createdApproval.id)
      })))
      .execute()
  }

  const insertedBeforeCurrent = currentAwaitingApproval !== undefined && (
    (body.position === 'before' && String(anchor.id) === String(currentAwaitingApproval.id))
    || (body.position === 'after'
      && anchor.egcs_cn_approvalvalue !== null
      && Number(anchor.egcs_cn_sequence) < Number(currentAwaitingApproval.egcs_cn_sequence))
  )
  if (insertedBeforeCurrent && currentAwaitingApproval) {
    await transitionRuntimeItem(trx, {
      runtimeId: String(routingSlip.runtimeId),
      runtimeItemId: String(currentAwaitingApproval.runtimeItemId),
      from: 'awaiting_action',
      to: 'paused',
      actorId,
      reason: 'additional_step_inserted_before'
    })
    await transitionRuntimeItem(trx, {
      runtimeId: String(routingSlip.runtimeId),
      runtimeItemId,
      from: 'pending',
      to: 'awaiting_action',
      actorId,
      reason: 'additional_step_inserted_before'
    })
  }

  return { id: String(createdApproval.id), runtimeItemId }
}
