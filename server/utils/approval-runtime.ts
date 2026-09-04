/* eslint-disable jsdoc/require-jsdoc */
import type { H3Event } from 'h3'
import type { Kysely } from 'kysely'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { listAgencyScopedCommonUsers, resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { buildRuntimeApprovalSteps, getRuntimeAdditionalApprovalPolicy, getRuntimeApprovals } from '~~/server/utils/approval-runtime-common'
import {
  listReviewApprovalBehalfTypes,
  listReviewApprovalRuntime
} from '~~/server/utils/review-approval-runtime'
import {
  resolveReviewRuntimeEntityFromEntity,
  resolveReviewRuntimeEntityFromReview,
  type ReviewRuntimeEntityContext
} from '~~/server/utils/review-runtime-access'
import type { Database, Entity_Type } from '~~/shared/types/database'
import { fetchCanonicalRoutingSlips } from './canonical-approval-runtime'
import { RUNTIME_TERMINAL_STATES } from '~~/shared/constants/system-lifecycle'
import { resolveEntityTypeLifecycleDefinition } from './entity-type-registry'
import { resolveExtensionLifecycleRuntime } from './extension-lifecycle-runtime'
import { escapeLikePattern } from './sql-like'

export const isDirectApprovalRuntimeEntitySupported = (entityType: Entity_Type): boolean =>
  entityType === 'commonreview'
  || entityType === 'commonrecommendation'
  || entityType === 'fundingcaseagreement'
  || entityType === 'fundingcaseagreementclaim'
  || entityType === 'fundingcaseagreementcloseout'
  || entityType === 'fundingcaseamendment'
  || entityType === 'fundingcaseagreementcommitment'
  || entityType === 'fundingcasemonitor'
  || entityType === 'fundingcasepayment'
  || entityType === 'fundingclaimreconcile'
  || entityType === 'fundingcaseforecast'

export const assertDirectApprovalRuntimeEntitySupported = async (
  event: H3Event,
  entityType: Entity_Type
) => {
  const definition = entityType?.includes(':')
    ? await resolveEntityTypeLifecycleDefinition(event.context.$db, entityType)
    : null
  if (isDirectApprovalRuntimeEntitySupported(entityType)
    || Boolean(definition && (definition.approvalSubmission !== 'none'
      || definition.standardWorkflow === 'explicit'))) {
    return
  }

  return await badRequest(event, 'UNSUPPORTED_APPROVAL_ENTITY_TYPE', 'apiErrors.request.invalid')
}

export const respondApprovalRuntimeEntityNotFound = async (
  event: H3Event,
  entityType: Entity_Type
) => {
  if (entityType === 'commonreview') {
    return await notFound(event, 'REVIEW_APPROVAL_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  if (entityType === 'commonrecommendation') {
    return await notFound(event, 'RECOMMENDATION_APPROVAL_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  if (entityType === 'fundingcaseagreementcloseout') {
    return await notFound(event, 'AGREEMENT_CLOSEOUT_APPROVAL_NOT_FOUND', 'apiErrors.agreement.closeout_not_found')
  }

  if (entityType === 'fundingcaseagreement') {
    return await notFound(event, 'AGREEMENT_APPROVAL_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  if (entityType === 'fundingcaseagreementclaim') {
    return await notFound(event, 'AGREEMENT_CLAIM_APPROVAL_NOT_FOUND', 'apiErrors.agreement.claim_not_found')
  }

  if (entityType === 'fundingcaseagreementcommitment') {
    return await notFound(event, 'AGREEMENT_COMMITMENT_APPROVAL_NOT_FOUND', 'apiErrors.agreement.commitment_not_found')
  }

  if (entityType === 'fundingcaseamendment') {
    return await notFound(event, 'AGREEMENT_AMENDMENT_APPROVAL_NOT_FOUND', 'apiErrors.agreement.amendment_not_found')
  }

  if (entityType === 'fundingcaseforecast') {
    return await notFound(event, 'AGREEMENT_FORECAST_APPROVAL_NOT_FOUND', 'apiErrors.agreement.forecast_not_found')
  }

  if (entityType === 'fundingcasemonitor') {
    return await notFound(event, 'AGREEMENT_MONITOR_APPROVAL_NOT_FOUND', 'apiErrors.agreement.monitor_not_found')
  }

  if (entityType === 'fundingcasepayment') {
    return await notFound(event, 'AGREEMENT_PAYMENT_APPROVAL_NOT_FOUND', 'apiErrors.agreement.payment_not_found')
  }

  if (entityType === 'fundingclaimreconcile') {
    return await notFound(event, 'AGREEMENT_CLAIM_RECONCILE_APPROVAL_NOT_FOUND', 'apiErrors.agreement.claim_reconcile_not_found')
  }

  return await notFound(event, 'APPROVAL_ENTITY_NOT_FOUND', 'apiErrors.admin_common.not_found')
}

export const resolveApprovalRuntimeEntityFromEntity = async (
  db: Kysely<Database>,
  entityType: Entity_Type,
  entityId: string
): Promise<ReviewRuntimeEntityContext | null> => {
  if (entityType === 'commonreview') {
    return await resolveReviewRuntimeEntityFromReview(db, entityId)
  }

  if (entityType === 'commonrecommendation') {
    const recommendation = await db.selectFrom('Common_Recommendation')
      .select(['egcs_cn_entitytype', 'egcs_cn_entityid'])
      .where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst()
    if (!recommendation) return null
    const source = await resolveReviewRuntimeEntityFromEntity(db, recommendation.egcs_cn_entitytype, String(recommendation.egcs_cn_entityid))
    return source ? { ...source, approvalEntityType: 'commonrecommendation', approvalEntityId: entityId } : null
  }

  if (entityType === 'fundingcaseagreement' || entityType === 'fundingcaseagreementcloseout') {
    return await resolveReviewRuntimeEntityFromEntity(db, entityType, entityId)
  }

  if (entityType === 'fundingcaseagreementcommitment') {
    return await resolveReviewRuntimeEntityFromEntity(db, entityType, entityId)
  }

  if (entityType === 'fundingcaseagreementclaim') {
    return await resolveReviewRuntimeEntityFromEntity(db, entityType, entityId)
  }

  if (entityType === 'fundingcaseamendment') {
    return await resolveReviewRuntimeEntityFromEntity(db, entityType, entityId)
  }

  if (entityType === 'fundingcaseforecast') {
    return await resolveReviewRuntimeEntityFromEntity(db, entityType, entityId)
  }

  if (entityType === 'fundingcasemonitor') {
    return await resolveReviewRuntimeEntityFromEntity(db, entityType, entityId)
  }

  if (entityType === 'fundingcasepayment') {
    return await resolveReviewRuntimeEntityFromEntity(db, entityType, entityId)
  }

  if (entityType === 'fundingclaimreconcile') {
    return await resolveReviewRuntimeEntityFromEntity(db, entityType, entityId)
  }

  if (entityType.includes(':')) {
    return await resolveReviewRuntimeEntityFromEntity(db, entityType, entityId)
  }

  return null
}

export const resolveApprovalRuntimeAgencyProjection = async (
  event: H3Event,
  runtimeEntity: ReviewRuntimeEntityContext
): Promise<ReviewRuntimeEntityContext | null> => {
  if (runtimeEntity.schemaAgencyId || !runtimeEntity.entityType.includes(':')) {
    return runtimeEntity
  }

  const current = await resolveExtensionLifecycleRuntime(
    event,
    runtimeEntity.entityType,
    runtimeEntity.entityId
  )
  if (!current) return null

  return {
    ...runtimeEntity,
    ...current.context,
    approvalEntityType: runtimeEntity.approvalEntityType ?? null,
    approvalEntityId: runtimeEntity.approvalEntityId ?? null
  }
}

export const listApprovalRuntime = async (
  event: H3Event,
  entityType: Entity_Type,
  entityId: string,
  options: {
    canManage: boolean
  }
) => {
  if (
    entityType !== 'commonreview'
  ) {
    const currentUser = await resolveCurrentCommonUser(event)
    const routingSlips = await fetchCanonicalRoutingSlips(event.context.$db, entityType, entityId)
    const runtimeRoutingSlips = await Promise.all(routingSlips.map(async (routingSlip, index) => {
      const { approvals, certificationsByApprovalId } = await getRuntimeApprovals(event.context.$db, String(routingSlip.id))
      const policy = await getRuntimeAdditionalApprovalPolicy(event.context.$db, routingSlip)
      return {
        id: String(routingSlip.id),
        approvalRuntimeId: String(routingSlip.runtimeId),
        approvalRuntimeState: routingSlip.routingSlipState,
        runtimeId: String(routingSlip.runtimeId),
        runtimeItemId: String(routingSlip.runtimeItemId),
        runtimeState: routingSlip.routingSlipState,
        attempt: Number(routingSlip.attempt),
        previousRuntimeId: routingSlip.previousRuntimeId === null ? null : String(routingSlip.previousRuntimeId),
        routingSlipId: String(routingSlip.id),
        egcs_cn_name_en: routingSlip.egcs_cn_name_en, egcs_cn_name_fr: routingSlip.egcs_cn_name_fr,
        is_current: index === 0, is_preview: false, ...policy,
        steps: buildRuntimeApprovalSteps({
          approvals, certificationsByApprovalId, routingSlipStatus: routingSlip.routingSlipState,
          currentCommonUserId: currentUser?.id ?? null, canManage: options.canManage,
          isTerminal: RUNTIME_TERMINAL_STATES.has(routingSlip.routingSlipState), canReassignTerminal: false,
          allowAdditionalApprovals: routingSlip.egcs_cn_allowadditionalapprovals
        })
      }
    }))
    const current = runtimeRoutingSlips[0] ?? null
    return { mode: current ? 'runtime' : 'none', routingSlip: current, routingSlips: runtimeRoutingSlips, template: null, steps: current?.steps ?? [], can_manage: options.canManage }
  }

  if (entityType === 'commonreview') {
    return await listReviewApprovalRuntime(event, entityId, options)
  }

  return null
}

export const listApprovalLookupUsers = async (
  db: Kysely<Database>,
  runtimeEntity: ReviewRuntimeEntityContext
) => {
  if (!runtimeEntity.schemaAgencyId) {
    return []
  }

  return await listAgencyScopedCommonUsers(db, runtimeEntity.schemaAgencyId)
}

export const listApprovalLookupBehalfTypes = async (
  db: Kysely<Database>,
  runtimeEntity: ReviewRuntimeEntityContext
) => {
  if (!runtimeEntity.schemaAgencyId) {
    return []
  }

  return await listReviewApprovalBehalfTypes(db, runtimeEntity.schemaAgencyId)
}

/**
 * Returns one stable, filtered page of active behalf types for a runtime's current Agency.
 * @param db Database connection or transaction.
 * @param runtimeEntity Current runtime ownership projection.
 * @param page One-based page number.
 * @param limit Maximum rows in the page.
 * @param search Optional literal bilingual search text.
 * @returns Matching page and filtered total.
 */
export const listApprovalLookupBehalfTypesPage = async (
  db: Kysely<Database>,
  runtimeEntity: ReviewRuntimeEntityContext,
  page: number,
  limit: number,
  search?: string
) => {
  if (!runtimeEntity.schemaAgencyId) return { items: [], total: 0 }

  let query = db.selectFrom('Agency_Approval_Behalf_Type')
    .where('egcs_ay_organizationagency', '=', runtimeEntity.schemaAgencyId)
    .where('_deleted', '=', false)
  if (search) {
    const escapedSearch = escapeLikePattern(search)
    query = query.where(eb => eb.or([
      eb('egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
      eb('egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`)
    ]))
  }

  const [items, count] = await Promise.all([
    query.select(['id', 'egcs_ay_name_en', 'egcs_ay_name_fr', 'egcs_ay_require_actual'])
      .orderBy('egcs_ay_name_en', 'asc').orderBy('id', 'asc')
      .limit(limit).offset((page - 1) * limit).execute(),
    query.select(eb => eb.fn.count('id').as('total')).executeTakeFirst()
  ])
  return { items, total: Number(count?.total ?? 0) }
}
