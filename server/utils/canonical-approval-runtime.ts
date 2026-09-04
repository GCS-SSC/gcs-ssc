/* eslint-disable jsdoc/require-jsdoc -- canonical approval orchestration adapter */
import { sql, type Kysely, type Transaction } from 'kysely'
import { RUNTIME_TERMINAL_STATES, type RuntimeState } from '~~/shared/constants/system-lifecycle'
import type { Database, Entity_Type, JsonValue, Workflow_Purpose } from '~~/shared/types/database'
import {
  ReviewApprovalDecisionEvidenceSchema,
  type ReviewApprovalDecisionEvidenceInput,
  type ReviewApprovalApproveInput,
  type ReviewApprovalDenyInput,
  type ReviewApprovalReassignInput
} from '~~/shared/types/schemas/review-approval'
import { readPublishedApprovalTemplate, type PublishedApprovalTemplate } from './approval-template-versioning'
import { listAgencyScopedCommonUsers, resolveCurrentCommonUser } from './additional-reviewer-runtime'
import { badRequest, forbidden, notFound } from './api-errors'
import { parseI18n } from './api-validate'
import {
  ApprovalTemplatePublicationMissingError,
  buildRuntimeApprovalSteps,
  getCurrentApprovalRoutingSlip,
  getRuntimeAdditionalApprovalPolicy,
  getRuntimeApprovals
} from './approval-runtime-common'
import { setAppUserDbSession } from './db-session'
import {
  activateRetriedApprovalRuntime,
  advanceReviewRuntimeAfterTerminalItem,
  advanceReviewSetRuntimeAfterTerminalItem
} from './review-runtime'
import { createRuntimeItem, transitionRuntimeItem } from './system-runtime'
import type { H3Event } from 'h3'

type DbClient = Kysely<Database> | Transaction<Database>

export type CanonicalRoutingSlipRow = Database['Common_Routing_Slip'] & {
  runtimeId: string
  runtimeState: RuntimeState
  runtimeItemId: string
  routingSlipState: RuntimeState
  attempt: number
  previousRuntimeId: string | null
}

const readApprovalTemplateVersion = async (
  trx: Transaction<Database>,
  templateId: string,
  versionId?: string,
  allowHistorical = false
) => {
  let query = trx.selectFrom('Common_Publication_Version')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Publication_Version.egcs_cn_publication')
    .innerJoin('Common_Approval_Template', 'Common_Approval_Template.id', 'Common_Publication.id')
    .select([
      'Common_Publication.id as publicationId',
      'Common_Publication.egcs_cn_state as publicationState',
      'Common_Publication.egcs_cn_currentversion as currentVersionId',
      'Common_Publication_Version.id as publicationVersionId',
      'Common_Publication_Version.egcs_cn_version as publicationVersion',
      'Common_Publication_Version.egcs_cn_definition as definition'
    ])
    .where('Common_Publication.id', '=', templateId)
    .where('Common_Publication.egcs_cn_kind', '=', 'approval_template')
    .where('Common_Publication._deleted', '=', false)
  query = versionId
    ? query.where('Common_Publication_Version.id', '=', versionId)
        .$if(!allowHistorical, queryBuilder => queryBuilder
          .where('Common_Publication.egcs_cn_state', '=', 'published')
          .whereRef('Common_Publication_Version.id', '=', 'Common_Publication.egcs_cn_currentversion'))
    : query
        .where('Common_Publication.egcs_cn_state', '=', 'published')
        .whereRef('Common_Publication_Version.id', '=', 'Common_Publication.egcs_cn_currentversion')
  const version = await query.executeTakeFirst()
  if (!version) throw new ApprovalTemplatePublicationMissingError(templateId)
  return {
    publicationId: String(version.publicationId),
    publicationVersionId: String(version.publicationVersionId),
    publicationVersion: Number(version.publicationVersion),
    definition: readPublishedApprovalTemplate(version.definition)
  }
}

const insertRoutingSlipCertifications = async (
  trx: Transaction<Database>,
  routingSlipId: string,
  template: PublishedApprovalTemplate
) => {
  if (template.additionalCertifications.length === 0) return
  await trx.insertInto('Common_Certification').values(template.additionalCertifications.map(certification => ({
    egcs_cn_order: certification.order,
    egcs_cn_description_en: certification.descriptionEn,
    egcs_cn_description_fr: certification.descriptionFr,
    egcs_cn_name_en: certification.nameEn,
    egcs_cn_name_fr: certification.nameFr,
    egcs_cn_optional: certification.optional,
    egcs_cn_certification_en: certification.certificationEn,
    egcs_cn_certification_fr: certification.certificationFr,
    egcs_cn_routingslip: routingSlipId,
    _deleted: false
  }))).execute()
}

const insertApprovalCertifications = async (
  trx: Transaction<Database>,
  approvalId: string,
  step: PublishedApprovalTemplate['steps'][number]
) => {
  if (step.certifications.length === 0) return
  await trx.insertInto('Common_Approval_Certification').values(step.certifications.map(certification => ({
    egcs_cn_optional: certification.optional,
    egcs_cn_certification_en: certification.certificationEn,
    egcs_cn_certification_fr: certification.certificationFr,
    egcs_cn_approval: approvalId
  }))).execute()
}

const resolveRuntimeParent = async (
  trx: Transaction<Database>,
  parentRuntimeItemId: string | null
) => {
  if (!parentRuntimeItemId) return null
  return await trx.selectFrom('Common_Runtime_Item')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Common_Runtime_Item.egcs_cn_runtime')
    .select([
      'Common_Runtime.id as runtimeId',
      'Common_Runtime.egcs_cn_state as rootState',
      'Common_Runtime_Item.id as parentRuntimeItemId',
      'Common_Runtime_Item.egcs_cn_kind as parentKind',
      'Common_Runtime_Item.egcs_cn_state as parentState'
    ])
    .where('Common_Runtime_Item.id', '=', parentRuntimeItemId)
    .where('Common_Runtime_Item._deleted', '=', false)
    .where('Common_Runtime._deleted', '=', false)
    .forUpdate(['Common_Runtime', 'Common_Runtime_Item'])
    .executeTakeFirstOrThrow()
}

const resolveExistingWorkflowRuntime = async (
  trx: Transaction<Database>,
  runtimeId: string,
  entityType: Entity_Type,
  entityId: string
) => await trx.selectFrom('Common_Runtime')
  .select([
    'id as runtimeId',
    'egcs_cn_state as rootState'
  ])
  .where('id', '=', runtimeId)
  .where('egcs_cn_kind', '=', 'workflow')
  .where('egcs_cn_entitytype', '=', entityType)
  .where('egcs_cn_entityid', '=', entityId)
  .where('egcs_cn_state', 'not in', [...RUNTIME_TERMINAL_STATES])
  .where('_deleted', '=', false)
  .forUpdate()
  .executeTakeFirstOrThrow()

export const materializeCanonicalApprovalRuntime = async (
  trx: Transaction<Database>,
  input: {
    entityType: Entity_Type
    entityId: string
    nameEn: string
    nameFr: string
    approvalTemplateId: string
    actorId: string
    parentRuntimeItemId?: string | null
    existingRuntimeId?: string
    runtimeItemOrder?: number
    approvalTemplateVersionId?: string
    purpose?: Workflow_Purpose
  }
) => {
  if (!input.parentRuntimeItemId && !input.existingRuntimeId) {
    throw new Error('Approval materialization requires a parent runtime item or an existing workflow runtime')
  }
  const version = await readApprovalTemplateVersion(
    trx,
    input.approvalTemplateId,
    input.approvalTemplateVersionId,
    Boolean(input.parentRuntimeItemId || input.existingRuntimeId)
  )
  if (version.definition.steps.length === 0) {
    throw new Error('Approval template must contain at least one step')
  }
  if (input.parentRuntimeItemId && input.existingRuntimeId) {
    throw new Error('Approval runtime cannot have both a parent item and an explicit workflow runtime')
  }
  if (input.runtimeItemOrder !== undefined && !input.existingRuntimeId) {
    throw new Error('Approval runtime item order requires an explicit workflow runtime')
  }
  if (input.runtimeItemOrder !== undefined && (!Number.isInteger(input.runtimeItemOrder) || input.runtimeItemOrder < 1)) {
    throw new Error('Approval runtime item order must be a positive integer')
  }
  const parent = await resolveRuntimeParent(trx, input.parentRuntimeItemId ?? null)
  const existingRuntime = input.existingRuntimeId
    ? await resolveExistingWorkflowRuntime(trx, input.existingRuntimeId, input.entityType, input.entityId)
    : null
  const runtime = parent ?? existingRuntime
  if (!runtime) throw new Error('Approval materialization requires a valid runtime owner')
  const runtimeId = String(runtime.runtimeId)
  let siblingQuery = trx.selectFrom('Common_Runtime_Item')
    .select(eb => eb.fn.max('egcs_cn_order').as('maximum'))
    .where('egcs_cn_runtime', '=', runtimeId)
  siblingQuery = parent
    ? siblingQuery.where('egcs_cn_parentruntimeitem', '=', String(parent.parentRuntimeItemId))
    : siblingQuery.where('egcs_cn_parentruntimeitem', 'is', null)
  const sibling = await siblingQuery.executeTakeFirst()
  const routingOrder = input.runtimeItemOrder ?? Number(sibling?.maximum ?? 0) + 1
  const routingRuntimeItemId = await createRuntimeItem(trx, {
    egcs_cn_runtime: runtimeId,
    egcs_cn_parentruntimeitem: parent ? String(parent.parentRuntimeItemId) : null,
    egcs_cn_kind: 'routing_slip',
    egcs_cn_order: routingOrder,
    egcs_cn_publication: version.publicationId,
    egcs_cn_publicationkind: 'approval_template',
    egcs_cn_publicationversion: version.publicationVersionId,
    egcs_cn_version: version.publicationVersion
  })
  const routingSlip = await trx.insertInto('Common_Routing_Slip').values({
    egcs_cn_entitytype: input.entityType,
    egcs_cn_entityid: input.entityId,
    egcs_cn_name_en: input.nameEn,
    egcs_cn_name_fr: input.nameFr,
    egcs_cn_approvaltemplate: version.publicationId,
    egcs_cn_allowadditionalapprovals: version.definition.allowAdditionalApprovals,
    egcs_cn_defaultaddedapprovalname_en: version.definition.defaultAddedApprovalNameEn,
    egcs_cn_defaultaddedapprovalname_fr: version.definition.defaultAddedApprovalNameFr,
    egcs_cn_allowaddedapprovalnamechanges: version.definition.allowAddedApprovalNameChanges,
    egcs_cn_allowaddedapprovalcertificationchanges: version.definition.allowAddedApprovalCertificationChanges,
    egcs_cn_runtimeitem: routingRuntimeItemId,
    _deleted: false
  }).returningAll().executeTakeFirstOrThrow()
  await insertRoutingSlipCertifications(trx, String(routingSlip.id), version.definition)

  const approvals: Array<{ approvalId: string, runtimeItemId: string }> = []
  for (const [index, step] of version.definition.steps.entries()) {
    const runtimeItemId = await createRuntimeItem(trx, {
      egcs_cn_runtime: runtimeId,
      egcs_cn_parentruntimeitem: routingRuntimeItemId,
      egcs_cn_kind: 'approval_step',
      egcs_cn_order: index + 1,
      egcs_cn_publication: version.publicationId,
      egcs_cn_publicationkind: 'approval_template',
      egcs_cn_publicationversion: version.publicationVersionId,
      egcs_cn_version: version.publicationVersion
    })
    const approval = await trx.insertInto('Common_Approval').values({
      egcs_cn_runtimeitem: runtimeItemId,
      egcs_cn_sequence: step.sequence,
      egcs_cn_name_en: step.nameEn,
      egcs_cn_name_fr: step.nameFr,
      egcs_cn_routingslip: String(routingSlip.id),
      egcs_cn_defaultuser: step.defaultUser,
      egcs_cn_assigneduser: step.defaultUser,
      egcs_cn_isadded: false
    }).returning('id').executeTakeFirstOrThrow()
    await insertApprovalCertifications(trx, String(approval.id), step)
    approvals.push({ approvalId: String(approval.id), runtimeItemId })
  }

  if (parent && (parent.parentState === 'pending' || parent.parentState === 'active')) {
    await transitionRuntimeItem(trx, {
      runtimeId,
      runtimeItemId: String(parent.parentRuntimeItemId),
      from: parent.parentState,
      to: 'awaiting_action',
      actorId: input.actorId,
      reason: 'approval_materialized'
    })
  }
  await transitionRuntimeItem(trx, {
    runtimeId,
    runtimeItemId: routingRuntimeItemId,
    from: 'pending',
    to: 'awaiting_action',
    actorId: input.actorId
  })
  const firstApproval = approvals[0]
  if (!firstApproval) throw new Error('Approval runtime has no steps')
  await transitionRuntimeItem(trx, {
    runtimeId,
    runtimeItemId: firstApproval.runtimeItemId,
    from: 'pending',
    to: 'awaiting_action',
    actorId: input.actorId
  })

  return {
    ...routingSlip,
    runtimeId,
    runtimeState: runtime.rootState,
    runtimeItemId: routingRuntimeItemId,
    routingSlipState: 'awaiting_action' as const,
    publicationVersionId: version.publicationVersionId,
    publicationVersion: version.publicationVersion,
    approvalRuntimeId: runtimeId,
    approvalRuntimeState: 'awaiting_action' as const,
    routingSlipId: String(routingSlip.id),
    approvals
  }
}

export const fetchCanonicalRoutingSlips = async (
  db: DbClient,
  entityType: Entity_Type,
  entityId: string,
  options: { lock?: boolean } = {}
) => {
  let query = db.selectFrom('Common_Routing_Slip')
    .innerJoin('Common_Runtime_Item as Routing_Item', 'Routing_Item.id', 'Common_Routing_Slip.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Routing_Item.egcs_cn_runtime')
    .selectAll('Common_Routing_Slip')
    .select([
      'Common_Runtime.id as runtimeId',
      'Common_Runtime.egcs_cn_kind as runtimeKind',
      'Common_Runtime.egcs_cn_state as runtimeState',
      'Common_Runtime.egcs_cn_attempt as attempt',
      'Common_Runtime.egcs_cn_previousruntime as previousRuntimeId',
      'Routing_Item.id as runtimeItemId',
      'Routing_Item.egcs_cn_state as routingSlipState',
      'Routing_Item.egcs_cn_publicationversion as publicationVersionId',
      'Routing_Item.egcs_cn_version as publicationVersion'
    ])
    .where('Common_Routing_Slip.egcs_cn_entitytype', '=', entityType)
    .where('Common_Routing_Slip.egcs_cn_entityid', '=', entityId)
    .where('Common_Routing_Slip._deleted', '=', false)
    .where('Routing_Item._deleted', '=', false)
    .where('Common_Runtime._deleted', '=', false)
    .orderBy('Common_Runtime.id', 'desc')
    .orderBy('Common_Routing_Slip.id', 'desc')
  if (options.lock) query = query.forUpdate(['Common_Runtime', 'Routing_Item', 'Common_Routing_Slip'])
  return await query.execute()
}

export const listCanonicalApprovalRuntime = async (
  event: H3Event,
  entityType: Entity_Type,
  entityId: string,
  options: { canManage: boolean }
) => {
  const currentUser = await resolveCurrentCommonUser(event)
  const routingSlips = await fetchCanonicalRoutingSlips(event.context.$db, entityType, entityId)
  const currentRoutingSlip = getCurrentApprovalRoutingSlip(routingSlips)
  const canManage = options.canManage && Boolean(
    !currentRoutingSlip || !RUNTIME_TERMINAL_STATES.has(currentRoutingSlip.routingSlipState)
  )
  const runtimeRoutingSlips = await Promise.all(routingSlips.map(async routingSlip => {
    const { approvals, certificationsByApprovalId } = await getRuntimeApprovals(
      event.context.$db,
      String(routingSlip.id)
    )
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
      egcs_cn_name_en: routingSlip.egcs_cn_name_en,
      egcs_cn_name_fr: routingSlip.egcs_cn_name_fr,
      is_current: String(routingSlip.id) === String(currentRoutingSlip?.id),
      is_preview: false,
      ...policy,
      steps: buildRuntimeApprovalSteps({
        approvals,
        certificationsByApprovalId,
        routingSlipStatus: routingSlip.routingSlipState,
        currentCommonUserId: currentUser?.id ?? null,
        canManage,
        isTerminal: RUNTIME_TERMINAL_STATES.has(routingSlip.routingSlipState),
        canReassignTerminal: false,
        allowAdditionalApprovals: routingSlip.egcs_cn_allowadditionalapprovals
      })
    }
  }))
  const current = runtimeRoutingSlips.find(item => item.is_current) ?? runtimeRoutingSlips[0] ?? null
  return {
    mode: current ? 'runtime' as const : 'none' as const,
    routingSlip: current,
    routingSlips: runtimeRoutingSlips,
    template: null,
    steps: current?.steps ?? [],
    can_manage: canManage
  }
}

const propagateApprovalOutcome = async (
  trx: Transaction<Database>,
  context: {
    runtimeId: string
    routingRuntimeItemId: string
    routingState: RuntimeState
    parentRuntimeItemId: string | null
    parentState: RuntimeState | null
  },
  outcome: 'approved' | 'denied',
  actorId: string
) => {
  if (outcome === 'denied') {
    const remainingSteps = await trx.selectFrom('Common_Runtime_Item')
      .select(['id', 'egcs_cn_state'])
      .where('egcs_cn_runtime', '=', context.runtimeId)
      .where('egcs_cn_parentruntimeitem', '=', context.routingRuntimeItemId)
      .where('egcs_cn_kind', '=', 'approval_step')
      .where('egcs_cn_state', 'not in', ['succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed'])
      .orderBy('egcs_cn_order', 'asc')
      .orderBy('id', 'asc')
      .forUpdate()
      .execute()
    for (const step of remainingSteps) {
      await transitionRuntimeItem(trx, {
        runtimeId: context.runtimeId,
        runtimeItemId: String(step.id),
        from: step.egcs_cn_state,
        to: 'cancelled',
        actorId,
        reason: 'approval_denied'
      })
    }
  }
  await transitionRuntimeItem(trx, {
    runtimeId: context.runtimeId,
    runtimeItemId: context.routingRuntimeItemId,
    from: context.routingState,
    to: outcome,
    actorId
  })
  if (context.parentRuntimeItemId && context.parentState && !['approved', 'denied'].includes(context.parentState)) {
    await transitionRuntimeItem(trx, {
      runtimeId: context.runtimeId,
      runtimeItemId: context.parentRuntimeItemId,
      from: context.parentState,
      to: outcome,
      actorId,
      reason: 'approval_outcome'
    })
  }
}

const persistDecisionEvidence = async (
  trx: Transaction<Database>,
  approvalId: string,
  body: ReviewApprovalApproveInput | ReviewApprovalDenyInput,
  approvalValue: boolean,
  positionTitle: string | null,
  approvalDate: Date
) => {
  for (const certification of body.certifications) {
    await trx.updateTable('Common_Approval_Certification')
      .set({ egcs_cn_value: certification.egcs_cn_value })
      .where('id', '=', certification.id)
      .where('egcs_cn_approval', '=', approvalId)
      .execute()
  }
  await trx.updateTable('Common_Approval').set({
    egcs_cn_onbehalf: body.egcs_cn_onbehalf ?? sql`null`,
    egcs_cn_approvalpositiontitle: positionTitle ?? sql`null`,
    egcs_cn_approvaldate: approvalDate,
    egcs_cn_comment: body.egcs_cn_comment ?? sql`null`,
    egcs_cn_attachment: sql`null`,
    egcs_cn_approvalvalue: approvalValue
  }).where('id', '=', approvalId).executeTakeFirstOrThrow()
}

const assertAgencyBehalfType = async (
  event: H3Event,
  trx: Transaction<Database>,
  behalfTypeId: string | null | undefined,
  agencyId: string | null | undefined
) => {
  if (!behalfTypeId) return null
  if (!agencyId) return await forbidden(event)
  const behalfType = await trx.selectFrom('Agency_Approval_Behalf_Type')
    .select(['id', 'egcs_ay_require_actual'])
    .where('id', '=', behalfTypeId)
    .where('egcs_ay_organizationagency', '=', agencyId)
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!behalfType) {
    return await badRequest(event, 'REVIEW_APPROVAL_INVALID_ON_BEHALF', 'apiErrors.request.invalid')
  }
  return behalfType
}

const assertApprovalCertifications = async (
  event: H3Event,
  trx: Transaction<Database>,
  approvalId: string,
  body: ReviewApprovalApproveInput | ReviewApprovalDenyInput,
  approvalValue: boolean
) => {
  const certifications = await trx.selectFrom('Common_Approval_Certification')
    .select(['id', 'egcs_cn_optional'])
    .where('egcs_cn_approval', '=', approvalId)
    .forUpdate()
    .execute()
  const certificationIds = new Set(certifications.map(certification => String(certification.id)))
  const submittedValues = new Map<string, boolean>()
  for (const certification of body.certifications) {
    const id = String(certification.id)
    if (!certificationIds.has(id) || submittedValues.has(id)) {
      return await badRequest(event, 'REVIEW_APPROVAL_CERTIFICATIONS_INVALID', 'apiErrors.review.review_approval_certifications_invalid')
    }
    submittedValues.set(id, certification.egcs_cn_value)
  }
  if (approvalValue && certifications.some(certification => (
    !certification.egcs_cn_optional && submittedValues.get(String(certification.id)) !== true
  ))) {
    return await badRequest(event, 'REVIEW_APPROVAL_CERTIFICATIONS_REQUIRED', 'apiErrors.review.review_approval_certifications_required')
  }
}

const advanceApprovalOwnerAfterTerminal = async (
  trx: Transaction<Database>,
  context: {
    entityType: Entity_Type
    entityId: string
    routingRuntimeItemId: string
    runtimeKind: Database['Common_Runtime']['egcs_cn_kind']
    parentRuntimeItemId: string | null
    parentKind: Database['Common_Runtime_Item']['egcs_cn_kind'] | null
  },
  actorId: string
) => {
  if (context.runtimeKind === 'workflow' && context.parentRuntimeItemId === null) {
    const { advanceWorkflowItem } = await import('./workflow-runtime')
    await advanceWorkflowItem(trx, context.routingRuntimeItemId, actorId)
    return
  }
  if (context.entityType === 'commonrecommendation') {
    const { advanceRecommendationRuntimeAfterTerminalItem } = await import('./recommendation-runtime')
    const aggregation = await advanceRecommendationRuntimeAfterTerminalItem(trx, context.entityId, actorId)
    if (aggregation && 'kind' in aggregation && aggregation.kind === 'final_approval_required') {
      await materializeCanonicalApprovalRuntime(trx, {
        entityType: aggregation.entityType,
        entityId: aggregation.entityId,
        nameEn: aggregation.nameEn,
        nameFr: aggregation.nameFr,
        approvalTemplateId: aggregation.approval.publicationId,
        approvalTemplateVersionId: aggregation.approval.publicationVersionId,
        actorId,
        parentRuntimeItemId: aggregation.recommendationSetRuntimeItemId,
        purpose: 'standard'
      })
    }
    return
  }
  if (context.entityType === 'commonreview') {
    const aggregation = await advanceReviewRuntimeAfterTerminalItem(trx, context.entityId, actorId)
    if (aggregation && 'kind' in aggregation && aggregation.kind === 'final_approval_required') {
      const activatedRetry = await activateRetriedApprovalRuntime(
        trx,
        aggregation.reviewSetRuntimeItemId,
        actorId
      )
      if (!activatedRetry) {
        await materializeCanonicalApprovalRuntime(trx, {
          entityType: aggregation.entityType,
          entityId: aggregation.entityId,
          nameEn: aggregation.nameEn,
          nameFr: aggregation.nameFr,
          approvalTemplateId: aggregation.approval.publicationId,
          approvalTemplateVersionId: aggregation.approval.publicationVersionId,
          actorId,
          parentRuntimeItemId: aggregation.reviewSetRuntimeItemId,
          purpose: 'standard'
        })
      }
    }
    return
  }
  if (context.parentKind === 'review_set' && context.parentRuntimeItemId) {
    const reviewSet = await trx.selectFrom('Common_Review_Set').select('id')
      .where('egcs_cn_runtimeitem', '=', context.parentRuntimeItemId)
      .where('_deleted', '=', false).executeTakeFirst()
    if (reviewSet) {
      await advanceReviewSetRuntimeAfterTerminalItem(trx, String(reviewSet.id), actorId)
    }
    return
  }
  if (context.parentKind === 'recommendation_set' && context.parentRuntimeItemId) {
    const recommendationSet = await trx.selectFrom('Common_Recommendation_Set').select('id')
      .where('egcs_cn_runtimeitem', '=', context.parentRuntimeItemId)
      .where('_deleted', '=', false).executeTakeFirst()
    if (recommendationSet) {
      const { advanceRecommendationSetRuntimeAfterTerminalItem } = await import('./recommendation-runtime')
      await advanceRecommendationSetRuntimeAfterTerminalItem(trx, String(recommendationSet.id), actorId)
    }
    return
  }
}

export const decideCanonicalApproval = async (
  event: H3Event,
  trx: Transaction<Database>,
  approvalId: string,
  body: ReviewApprovalApproveInput | ReviewApprovalDenyInput,
  approvalValue: boolean,
  options: { agencyId?: string | null } = {}
) => {
  const actor = await resolveCurrentCommonUser(event, trx)
  if (!actor) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const actorId = String(actor.id)
  await setAppUserDbSession(trx, actorId)
  const approval = await trx.selectFrom('Common_Approval')
    .innerJoin('Common_Runtime_Item as Approval_Item', 'Approval_Item.id', 'Common_Approval.egcs_cn_runtimeitem')
    .innerJoin('Common_Routing_Slip', 'Common_Routing_Slip.id', 'Common_Approval.egcs_cn_routingslip')
    .innerJoin('Common_Runtime_Item as Routing_Item', 'Routing_Item.id', 'Common_Routing_Slip.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Routing_Item.egcs_cn_runtime')
    .leftJoin('Common_Runtime_Item as Parent_Item', 'Parent_Item.id', 'Routing_Item.egcs_cn_parentruntimeitem')
    .select([
      'Common_Approval.id',
      'Common_Approval.egcs_cn_assigneduser',
      'Common_Approval.egcs_cn_defaultuser',
      'Common_Approval.egcs_cn_approvalvalue',
      'Common_Approval.egcs_cn_sequence',
      'Common_Routing_Slip.id as routingSlipId',
      'Common_Routing_Slip.egcs_cn_entitytype as entityType',
      'Common_Routing_Slip.egcs_cn_entityid as entityId',
      'Common_Runtime.id as runtimeId',
      'Common_Runtime.egcs_cn_kind as runtimeKind',
      'Routing_Item.id as routingRuntimeItemId',
      'Routing_Item.egcs_cn_state as routingState',
      'Routing_Item.egcs_cn_parentruntimeitem as parentRuntimeItemId',
      'Parent_Item.egcs_cn_state as parentState',
      'Parent_Item.egcs_cn_kind as parentKind',
      'Approval_Item.id as approvalRuntimeItemId',
      'Approval_Item.egcs_cn_state as approvalState'
    ])
    .where('Common_Approval.id', '=', approvalId)
    .where('Common_Routing_Slip._deleted', '=', false)
    .forUpdate(['Common_Runtime', 'Routing_Item', 'Approval_Item', 'Common_Approval'])
    .executeTakeFirst()
  if (!approval) return await notFound(event, 'REVIEW_APPROVAL_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const assignedUserId = String(approval.egcs_cn_assigneduser ?? approval.egcs_cn_defaultuser)
  if (assignedUserId !== actorId) return await forbidden(event)
  if (approval.egcs_cn_approvalvalue !== null || approval.approvalState !== 'awaiting_action'
    || approval.routingState !== 'awaiting_action') {
    return await badRequest(event, 'REVIEW_APPROVAL_INVALID_STATUS', 'apiErrors.request.invalid_status')
  }
  const behalfType = await assertAgencyBehalfType(event, trx, body.egcs_cn_onbehalf, options.agencyId)
  const decisionEvidence: ReviewApprovalDecisionEvidenceInput = await parseI18n(
    event,
    ReviewApprovalDecisionEvidenceSchema,
    {
      egcs_cn_defaultuser: approval.egcs_cn_defaultuser,
      egcs_cn_assigneduser: assignedUserId,
      egcs_cn_onbehalf: body.egcs_cn_onbehalf,
      egcs_ay_require_actual: behalfType?.egcs_ay_require_actual === true,
      egcs_cn_approvalpositiontitle: body.egcs_cn_approvalpositiontitle,
      egcs_cn_approvaldate: body.egcs_cn_approvaldate
    }
  )
  await assertApprovalCertifications(event, trx, approvalId, body, approvalValue)
  let positionTitle = decisionEvidence.egcs_cn_onbehalf
    ? decisionEvidence.egcs_cn_approvalpositiontitle ?? actor.positionTitle
    : actor.positionTitle
  let approvalDate = decisionEvidence.egcs_cn_approvaldate ?? new Date()
  if (decisionEvidence.egcs_ay_require_actual) {
    if (!decisionEvidence.egcs_cn_approvalpositiontitle || !decisionEvidence.egcs_cn_approvaldate) {
      throw new Error('Actual on-behalf decision evidence passed validation without explicit title and date')
    }
    positionTitle = decisionEvidence.egcs_cn_approvalpositiontitle
    approvalDate = decisionEvidence.egcs_cn_approvaldate
  }
  await persistDecisionEvidence(trx, approvalId, body, approvalValue, positionTitle, approvalDate)
  const outcome = approvalValue ? 'approved' : 'denied'
  await transitionRuntimeItem(trx, {
    runtimeId: String(approval.runtimeId),
    runtimeItemId: String(approval.approvalRuntimeItemId),
    from: 'awaiting_action',
    to: outcome,
    actorId
  })
  if (!approvalValue) {
    await propagateApprovalOutcome(trx, {
      runtimeId: String(approval.runtimeId),
      routingRuntimeItemId: String(approval.routingRuntimeItemId),
      routingState: approval.routingState,
      parentRuntimeItemId: approval.parentRuntimeItemId === null ? null : String(approval.parentRuntimeItemId),
      parentState: approval.parentState
    }, 'denied', actorId)
    await advanceApprovalOwnerAfterTerminal(trx, {
      entityType: approval.entityType,
      entityId: String(approval.entityId),
      routingRuntimeItemId: String(approval.routingRuntimeItemId),
      runtimeKind: approval.runtimeKind,
      parentRuntimeItemId: approval.parentRuntimeItemId === null ? null : String(approval.parentRuntimeItemId),
      parentKind: approval.parentKind
    }, actorId)
    return { approvalRuntimeId: String(approval.runtimeId), approvalRuntimeState: 'denied' as const, routingSlipId: String(approval.routingSlipId) }
  }
  const next = await trx.selectFrom('Common_Approval')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Approval.egcs_cn_runtimeitem')
    .select(['Common_Approval.id', 'Common_Runtime_Item.id as runtimeItemId', 'Common_Runtime_Item.egcs_cn_state'])
    .where('Common_Approval.egcs_cn_routingslip', '=', String(approval.routingSlipId))
    .where('Common_Approval.egcs_cn_approvalvalue', 'is', null)
    .where('Common_Approval.id', '!=', approvalId)
    .orderBy('Common_Approval.egcs_cn_sequence', 'asc')
    .orderBy('Common_Approval.id', 'asc')
    .forUpdate('Common_Runtime_Item')
    .executeTakeFirst()
  if (next) {
    if (next.egcs_cn_state !== 'pending' && next.egcs_cn_state !== 'paused') {
      return await badRequest(event, 'REVIEW_APPROVAL_INVALID_STATUS', 'apiErrors.request.invalid_status')
    }
    await transitionRuntimeItem(trx, {
      runtimeId: String(approval.runtimeId),
      runtimeItemId: String(next.runtimeItemId),
      from: next.egcs_cn_state,
      to: 'awaiting_action',
      actorId,
      reason: 'approval_sequence_advanced'
    })
    return { approvalRuntimeId: String(approval.runtimeId), approvalRuntimeState: 'awaiting_action' as const, routingSlipId: String(approval.routingSlipId) }
  }
  await propagateApprovalOutcome(trx, {
    runtimeId: String(approval.runtimeId),
    routingRuntimeItemId: String(approval.routingRuntimeItemId),
    routingState: approval.routingState,
    parentRuntimeItemId: approval.parentRuntimeItemId === null ? null : String(approval.parentRuntimeItemId),
    parentState: approval.parentState
  }, 'approved', actorId)
  await advanceApprovalOwnerAfterTerminal(trx, {
    entityType: approval.entityType,
    entityId: String(approval.entityId),
    routingRuntimeItemId: String(approval.routingRuntimeItemId),
    runtimeKind: approval.runtimeKind,
    parentRuntimeItemId: approval.parentRuntimeItemId === null ? null : String(approval.parentRuntimeItemId),
    parentKind: approval.parentKind
  }, actorId)
  return { approvalRuntimeId: String(approval.runtimeId), approvalRuntimeState: 'approved' as const, routingSlipId: String(approval.routingSlipId) }
}

export const reassignCanonicalApproval = async (
  event: H3Event,
  trx: Transaction<Database>,
  approvalId: string,
  body: ReviewApprovalReassignInput,
  options: { agencyId?: string | null, invalidStatusCode?: string } = {}
) => {
  const approval = await trx.selectFrom('Common_Approval')
    .innerJoin('Common_Runtime_Item as Approval_Item', 'Approval_Item.id', 'Common_Approval.egcs_cn_runtimeitem')
    .innerJoin('Common_Routing_Slip', 'Common_Routing_Slip.id', 'Common_Approval.egcs_cn_routingslip')
    .innerJoin('Common_Runtime_Item as Routing_Item', 'Routing_Item.id', 'Common_Routing_Slip.egcs_cn_runtimeitem')
    .select([
      'Common_Approval.id', 'Common_Approval.egcs_cn_defaultuser', 'Common_Approval.egcs_cn_approvalvalue',
      'Approval_Item.egcs_cn_state as approvalState', 'Routing_Item.egcs_cn_state as routingState'
    ])
    .where('Common_Approval.id', '=', approvalId)
    .where('Common_Routing_Slip._deleted', '=', false)
    .forUpdate(['Routing_Item', 'Approval_Item', 'Common_Approval'])
    .executeTakeFirst()
  if (!approval) return await notFound(event, 'REVIEW_APPROVAL_NOT_FOUND', 'apiErrors.admin_common.not_found')
  if (approval.egcs_cn_approvalvalue !== null || RUNTIME_TERMINAL_STATES.has(approval.routingState)
    || RUNTIME_TERMINAL_STATES.has(approval.approvalState)) {
    return await badRequest(
      event,
      options.invalidStatusCode ?? 'REVIEW_APPROVAL_INVALID_STATUS',
      'apiErrors.request.invalid_status'
    )
  }
  if (String(body.egcs_cn_assigneduser) !== String(approval.egcs_cn_defaultuser) && !body.egcs_cn_onbehalf) {
    return await badRequest(event, 'REVIEW_APPROVAL_ON_BEHALF_REQUIRED', 'apiErrors.review.review_approval_on_behalf_required')
  }
  if (!options.agencyId) return await forbidden(event)
  const agencyUsers = await listAgencyScopedCommonUsers(trx, options.agencyId)
  if (!agencyUsers.some(user => user.id === String(body.egcs_cn_assigneduser))) {
    return await badRequest(event, 'REVIEW_APPROVAL_USER_OUTSIDE_AGENCY', 'apiErrors.request.invalid')
  }
  await assertAgencyBehalfType(event, trx, body.egcs_cn_onbehalf, options.agencyId)
  await trx.updateTable('Common_Approval').set({
    egcs_cn_assigneduser: body.egcs_cn_assigneduser,
    egcs_cn_onbehalf: String(body.egcs_cn_assigneduser) === String(approval.egcs_cn_defaultuser)
      ? sql`null`
      : body.egcs_cn_onbehalf ?? sql`null`,
    egcs_cn_approvalpositiontitle: sql`null`,
    egcs_cn_approvaldate: sql`null`,
    egcs_cn_comment: sql`null`,
    egcs_cn_attachment: sql`null`
  }).where('id', '=', approvalId).executeTakeFirstOrThrow()
  return { id: approvalId }
}

export const readCanonicalApprovalDefinition = (value: JsonValue): PublishedApprovalTemplate =>
  readPublishedApprovalTemplate(value)
