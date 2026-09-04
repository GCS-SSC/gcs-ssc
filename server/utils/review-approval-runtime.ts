/* eslint-disable jsdoc/require-jsdoc -- Review approval helpers expose typed contracts covered by focused tests. */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import { RUNTIME_TERMINAL_STATES, type RuntimeState } from '~~/shared/constants/system-lifecycle'
import type { Database } from '~~/shared/types/database'
import type {
  ReviewApprovalApproveInput,
  ReviewApprovalDenyInput,
  ReviewApprovalReassignInput
} from '~~/shared/types/schemas/review-approval'
import { badRequest, notFound } from './api-errors'
import {
  decideCanonicalApproval,
  fetchCanonicalRoutingSlips,
  listCanonicalApprovalRuntime,
  materializeCanonicalApprovalRuntime,
  reassignCanonicalApproval
} from './canonical-approval-runtime'
import { resolveCurrentCommonUser } from './additional-reviewer-runtime'
import {
  activateRetriedApprovalRuntime,
  advanceReviewRuntimeAfterTerminalItem,
  advanceReviewSetRuntimeAfterTerminalItem
} from './review-runtime'
import {
  executeFreshAuthorizedApprovalActorWrite,
  executeFreshAuthorizedReviewRuntimeWrite,
  resolveReviewRuntimeEntityFromEntity,
  resolveReviewRuntimeEntityFromReview,
  type ReviewRuntimeEntityContext
} from './review-runtime-access'
import { readPublishedReviewSetup, type PublishedPublicationReference } from './review-setup-versioning'
import { readPublishedReviewSchema } from './review-schema-versioning'

type DbClient = Kysely<Database> | Transaction<Database>

type RuntimeReviewApprovalContext = {
  reviewId: string
  reviewStatus: RuntimeState
  reviewRuntimeItemId: string
  reviewRuntimeId: string
  attempt: number
  previousRuntimeId: string | null
  reviewNameEn: string
  reviewNameFr: string
  reviewSetId: string
  reviewSetStatus: RuntimeState
  reviewSetRuntimeItemId: string
  reviewApprovalTemplateId: string | null
  reviewApprovalTemplateVersionId: string | null
  reviewApprovalTemplateVersion: number | null
  entityType: Database['Common_Review_Set']['egcs_cn_entitytype']
  entityId: string
  schemaAgencyId: string
  runtimeInitiatedBy: string
}

export const getReviewApprovalContext = async (
  db: DbClient,
  reviewId: string
): Promise<RuntimeReviewApprovalContext | null> => {
  const row = await db.selectFrom('Common_Review')
    .innerJoin('Common_Review_Set', 'Common_Review_Set.id', 'Common_Review.egcs_cn_reviewset')
    .innerJoin('Common_Runtime_Item as Review_Item', 'Review_Item.id', 'Common_Review.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime_Item as Set_Item', 'Set_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Review_Item.egcs_cn_runtime')
    .innerJoin('Common_Publication_Version as Review_Version', 'Review_Version.id', 'Review_Item.egcs_cn_publicationversion')
    .innerJoin('Common_Publication_Version as Set_Version', 'Set_Version.id', 'Set_Item.egcs_cn_publicationversion')
    .select([
      'Common_Review.id as reviewId',
      'Review_Item.id as reviewRuntimeItemId',
      'Review_Item.egcs_cn_order as reviewOrder',
      'Review_Item.egcs_cn_state as reviewStatus',
      'Common_Runtime.id as reviewRuntimeId',
      'Common_Runtime.egcs_cn_attempt as attempt',
      'Common_Runtime.egcs_cn_previousruntime as previousRuntimeId',
      'Common_Runtime.egcs_cn_initiatedby as runtimeInitiatedBy',
      'Common_Review_Set.id as reviewSetId',
      'Set_Item.id as reviewSetRuntimeItemId',
      'Set_Item.egcs_cn_state as reviewSetStatus',
      'Common_Review_Set.egcs_cn_entitytype as entityType',
      'Common_Review_Set.egcs_cn_entityid as entityId',
      'Review_Version.egcs_cn_definition as reviewDefinition',
      'Set_Version.egcs_cn_definition as setDefinition'
    ])
    .where('Common_Review.id', '=', reviewId)
    .where('Common_Review._deleted', '=', false)
    .where('Common_Review_Set._deleted', '=', false)
    .where('Review_Item._deleted', '=', false)
    .where('Set_Item._deleted', '=', false)
    .executeTakeFirst()
  if (!row) return null

  const reviewDefinition = readPublishedReviewSchema(row.reviewDefinition)
  if (!reviewDefinition) return null
  const setup = readPublishedReviewSetup(row.setDefinition)
  if (!Array.isArray(setup.members)) return null
  const member = setup.members.find(candidate => candidate.order === row.reviewOrder)
  const approval: PublishedPublicationReference | undefined = member?.approval
  return {
    reviewId: String(row.reviewId),
    reviewStatus: row.reviewStatus,
    reviewRuntimeItemId: String(row.reviewRuntimeItemId),
    reviewRuntimeId: String(row.reviewRuntimeId),
    attempt: Number(row.attempt),
    previousRuntimeId: row.previousRuntimeId === null ? null : String(row.previousRuntimeId),
    reviewNameEn: reviewDefinition.name.en,
    reviewNameFr: reviewDefinition.name.fr,
    reviewSetId: String(row.reviewSetId),
    reviewSetStatus: row.reviewSetStatus,
    reviewSetRuntimeItemId: String(row.reviewSetRuntimeItemId),
    reviewApprovalTemplateId: approval?.publicationId ?? null,
    reviewApprovalTemplateVersionId: approval?.publicationVersionId ?? null,
    reviewApprovalTemplateVersion: approval?.publicationVersion ?? null,
    entityType: row.entityType,
    entityId: String(row.entityId),
    schemaAgencyId: reviewDefinition.agencyId,
    runtimeInitiatedBy: String(row.runtimeInitiatedBy)
  }
}

export const fetchReviewApprovalRoutingSlip = async (db: DbClient, reviewId: string) => (
  await fetchCanonicalRoutingSlips(db, 'commonreview', reviewId)
)[0] ?? null

const resolveApprovalReadCapabilities = async (event: H3Event, reviewId: string) => {
  const currentCommonUser = await resolveCurrentCommonUser(event)
  if (!currentCommonUser) return { currentCommonUserId: null, isAssignedApprover: false }
  const assignedApproval = await event.context.$db.selectFrom('Common_Approval')
    .innerJoin('Common_Routing_Slip', 'Common_Routing_Slip.id', 'Common_Approval.egcs_cn_routingslip')
    .select('Common_Approval.id')
    .where('Common_Routing_Slip.egcs_cn_entitytype', '=', 'commonreview')
    .where('Common_Routing_Slip.egcs_cn_entityid', '=', reviewId)
    .where('Common_Routing_Slip._deleted', '=', false)
    .where('Common_Approval.egcs_cn_assigneduser', '=', currentCommonUser.id)
    .executeTakeFirst()
  return { currentCommonUserId: currentCommonUser.id, isAssignedApprover: Boolean(assignedApproval) }
}

export const canCurrentUserReadReviewApprovals = async (event: H3Event, reviewId: string) => (
  await resolveApprovalReadCapabilities(event, reviewId)
).isAssignedApprover

export const listReviewApprovalRuntime = async (
  event: H3Event,
  reviewId: string,
  options: { canManage: boolean }
) => {
  const context = await getReviewApprovalContext(event.context.$db, reviewId)
  if (!context) return null
  const result = await listCanonicalApprovalRuntime(event, 'commonreview', reviewId, options)
  const mode = !context.reviewApprovalTemplateId
    ? 'none' as const
    : result.mode === 'none'
      ? 'pendingmaterialization' as const
      : result.mode
  return {
    ...result,
    mode,
    reviewId: context.reviewId,
    reviewSetId: context.reviewSetId,
    runtimeId: context.reviewRuntimeId,
    runtimeItemId: context.reviewRuntimeItemId,
    runtimeState: context.reviewStatus,
    parentRuntimeItemId: context.reviewSetRuntimeItemId,
    parentRuntimeState: context.reviewSetStatus,
    attempt: context.attempt,
    previousRuntimeId: context.previousRuntimeId
  }
}

export const materializeReviewApprovalChain = async (
  trx: Transaction<Database>,
  reviewId: string,
  actorId?: string
) => {
  const context = await getReviewApprovalContext(trx, reviewId)
  if (!context?.reviewApprovalTemplateId || !context.reviewApprovalTemplateVersionId) return null
  const decisionActorId = actorId ?? context.runtimeInitiatedBy
  if (await activateRetriedApprovalRuntime(trx, context.reviewRuntimeItemId, decisionActorId)) {
    return await fetchReviewApprovalRoutingSlip(trx, reviewId)
  }
  const existing = await fetchCanonicalRoutingSlips(trx, 'commonreview', reviewId, { lock: true })
  if (existing[0]) return existing[0]
  return await materializeCanonicalApprovalRuntime(trx, {
    entityType: 'commonreview',
    entityId: reviewId,
    nameEn: context.reviewNameEn,
    nameFr: context.reviewNameFr,
    approvalTemplateId: context.reviewApprovalTemplateId,
    approvalTemplateVersionId: context.reviewApprovalTemplateVersionId,
    actorId: decisionActorId,
    parentRuntimeItemId: context.reviewRuntimeItemId,
    purpose: 'standard'
  })
}

export const syncReviewSetApprovalStatus = async (
  trx: Transaction<Database>,
  reviewSetId: string,
  actorId?: string
) => {
  const row = await trx.selectFrom('Common_Review_Set')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
    .select('Common_Runtime_Item.egcs_cn_state as state')
    .where('Common_Review_Set.id', '=', reviewSetId)
    .where('Common_Review_Set._deleted', '=', false)
    .executeTakeFirst()
  if (!row) return null
  if (RUNTIME_TERMINAL_STATES.has(row.state)) {
    await advanceReviewSetRuntimeAfterTerminalItem(trx, reviewSetId, actorId)
  }
  return row.state
}

export const syncReviewApprovalOutcome = async (
  trx: Transaction<Database>,
  reviewId: string,
  actorId?: string
) => {
  const context = await getReviewApprovalContext(trx, reviewId)
  if (!context) return null
  if (RUNTIME_TERMINAL_STATES.has(context.reviewStatus)) {
    await advanceReviewRuntimeAfterTerminalItem(trx, reviewId, actorId)
  }
  return context.reviewStatus
}

export const resolveApprovalActionContext = async (db: DbClient, approvalId: string) => {
  const approval = await db.selectFrom('Common_Approval')
    .innerJoin('Common_Routing_Slip', 'Common_Routing_Slip.id', 'Common_Approval.egcs_cn_routingslip')
    .select([
      'Common_Approval.id as approvalId',
      'Common_Routing_Slip.egcs_cn_entitytype as entityType',
      'Common_Routing_Slip.egcs_cn_entityid as entityId'
    ])
    .where('Common_Approval.id', '=', approvalId)
    .where('Common_Routing_Slip._deleted', '=', false)
    .executeTakeFirst()
  if (!approval) return null

  const entityId = String(approval.entityId)
  if (approval.entityType === 'commonreview') {
    const runtimeEntity = await resolveReviewRuntimeEntityFromReview(db as Kysely<Database>, entityId)
    return runtimeEntity ? { approvalId: String(approval.approvalId), reviewId: entityId, runtimeEntity } : null
  }
  if (approval.entityType === 'commonrecommendation') {
    const recommendation = await db.selectFrom('Common_Recommendation')
      .select(['id', 'egcs_cn_entitytype', 'egcs_cn_entityid'])
      .where('id', '=', entityId)
      .where('_deleted', '=', false)
      .executeTakeFirst()
    if (!recommendation) return null
    const owner = await resolveReviewRuntimeEntityFromEntity(
      db as Kysely<Database>,
      recommendation.egcs_cn_entitytype,
      String(recommendation.egcs_cn_entityid)
    )
    return owner
      ? {
          approvalId: String(approval.approvalId),
          recommendationId: String(recommendation.id),
          runtimeEntity: {
            ...owner,
            approvalEntityType: 'commonrecommendation' as const,
            approvalEntityId: String(recommendation.id)
          }
        }
      : null
  }
  const runtimeEntity = await resolveReviewRuntimeEntityFromEntity(
    db as Kysely<Database>, approval.entityType, entityId
  )
  if (!runtimeEntity) return null
  const decoratedRuntimeEntity: ReviewRuntimeEntityContext = {
    ...runtimeEntity,
    approvalEntityType: approval.entityType,
    approvalEntityId: entityId
  }
  if (approval.entityType === 'fundingcaseagreement' || approval.entityType === 'fundingcaseagreementcloseout') {
    return {
      approvalId: String(approval.approvalId),
      workflowSourceId: entityId,
      workflowSourceEntityType: approval.entityType,
      runtimeEntity: decoratedRuntimeEntity
    }
  }
  return { approvalId: String(approval.approvalId), entityId, runtimeEntity: decoratedRuntimeEntity }
}

export const resolveRecommendationApprovalRoutingSlipStatus = (
  approvals: ReadonlyArray<{ id: string | number, egcs_cn_approvalvalue: boolean | null | undefined }>,
  approvalId: string,
  approvalValue: boolean
) => approvalValue === false
  ? 'denied' as const
  : approvals.every(approval => String(approval.id) === approvalId || approval.egcs_cn_approvalvalue === true)
    ? 'approved' as const
    : 'awaiting_action' as const

const recordCanonicalDecision = async (
  event: H3Event,
  approvalId: string,
  body: ReviewApprovalApproveInput | ReviewApprovalDenyInput,
  approvalValue: boolean
) => {
  const actionContext = await resolveApprovalActionContext(event.context.$db, approvalId)
  if (!actionContext) return await notFound(event, 'REVIEW_APPROVAL_NOT_FOUND', 'apiErrors.admin_common.not_found')
  return await executeFreshAuthorizedApprovalActorWrite(event, actionContext.runtimeEntity, async (trx, current) => {
    const agencyId = current?.schemaAgencyId ?? actionContext.runtimeEntity.schemaAgencyId
    if (!agencyId) return await badRequest(event, 'APPROVAL_AGENCY_NOT_FOUND', 'apiErrors.request.invalid')
    return await decideCanonicalApproval(event, trx, approvalId, body, approvalValue, { agencyId })
  })
}

export const approveReviewApproval = async (
  event: H3Event,
  approvalId: string,
  body: ReviewApprovalApproveInput
) => await recordCanonicalDecision(event, approvalId, body, true)

export const denyReviewApproval = async (
  event: H3Event,
  approvalId: string,
  body: ReviewApprovalDenyInput
) => await recordCanonicalDecision(event, approvalId, body, false)

export const reassignReviewApproval = async (
  event: H3Event,
  approvalId: string,
  body: ReviewApprovalReassignInput
) => {
  const actionContext = await resolveApprovalActionContext(event.context.$db, approvalId)
  if (!actionContext) return await notFound(event, 'REVIEW_APPROVAL_NOT_FOUND', 'apiErrors.admin_common.not_found')
  return await executeFreshAuthorizedReviewRuntimeWrite(event, actionContext.runtimeEntity, async (trx, current) => {
    if (!current.schemaAgencyId) {
      return await badRequest(event, 'APPROVAL_AGENCY_NOT_FOUND', 'apiErrors.request.invalid')
    }
    return await reassignCanonicalApproval(event, trx, approvalId, body, {
      agencyId: current.schemaAgencyId
    })
  })
}

export const listReviewApprovalBehalfTypes = async (db: DbClient, agencyId: string) => await db
  .selectFrom('Agency_Approval_Behalf_Type')
  .select(['id', 'egcs_ay_name_en', 'egcs_ay_name_fr', 'egcs_ay_require_actual'])
  .where('egcs_ay_organizationagency', '=', agencyId)
  .where('_deleted', '=', false)
  .orderBy('egcs_ay_name_en', 'asc')
  .execute()
