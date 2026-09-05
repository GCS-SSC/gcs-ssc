import { captureWorkflowRouting, WorkflowRouteValidationError, type WorkflowRoutingEvidence } from './workflow-routing'
/* eslint-disable jsdoc/require-jsdoc -- canonical workflow orchestration is covered by focused lifecycle tests */
import { sql, type Kysely, type Selectable, type Transaction } from 'kysely'
import type { H3Event } from 'h3'
import { useTranslation } from '@intlify/h3'
import {
  RUNTIME_TERMINAL_STATES,
  type RuntimeState
} from '~~/shared/constants/system-lifecycle'
import type {
  Database,
  Entity_Type,
  JsonValue,
  Workflow_Purpose,
  Workflow_Transition_Event
} from '~~/shared/types/database'
import type { StatusId } from '~~/shared/types/status'
import { badRequest, throwApiError } from './api-errors'
import { getDatabaseConstraintName } from './database-constraint-errors'
import {
  AgreementApprovalSubmissionHashMismatchError,
  AgreementApprovalSubmissionPromotionError,
  buildAgreementApprovalSnapshot,
  hashAgreementApprovalSnapshot,
  type AgreementApprovalSnapshotV1
} from './agreement-approval-submission'
import { promoteApprovedAgreementAmendment, resolveAgreementAmendmentRuntimeContext } from './agreement-amendment'
import { buildAgreementCloseoutReadiness, hashAgreementCloseoutSnapshot } from './agreement-closeout'
import { lockAgreementProfileForUpdate } from './agreement-write-transaction'
import {
  BusinessStatusViolation,
  isBusinessStatusEntityType,
  lockBusinessStatus,
  resolveBusinessStatusId,
  transitionBusinessStatus
} from './business-status-runtime'
import { materializeCanonicalApprovalRuntime } from './canonical-approval-runtime'
import { resolveAgencyValidEntityAssigneeIdsWithDb } from './entity-assignment'
import {
  createRuntimeRecommendationSetInTransaction
} from './recommendation-runtime'
import { readPublishedRecommendationSchema } from './recommendation-setup-versioning'
import {
  getReviewRuntimeOwnerAgencyId,
  resolveReviewRuntimeEntityFromEntity,
  resolveReviewRuntimeSetupScopes,
  type ReviewRuntimeEntityContext
} from './review-runtime-access'
import {
  createRuntimeReviewSetInTransaction,
  resumeSequentialRuntimeReviewSet
} from './review-runtime'
import { cancelRuntimeTree, createRuntime, retryRuntime, transitionRuntime, type RuntimeMetadata } from './system-runtime'
import {
  applyPublishedWorkflowConfiguration,
  readPublishedWorkflowConfiguration,
  type PublishedWorkflowConfiguration,
  type PublishedWorkflowMember,
  type RuntimeWorkflowSetup
} from './workflow-setup-versioning'
import { lockPublicationSelectionKeys } from './system-publication'
import { isAssignableEntityType } from '~~/shared/utils/entity-assignments'
import {
  getCoreEntityDefinition,
  isCoreEntityType,
  requiresApprovalSubmissionAtCompletion,
  requiresTerminalApprovalSubmissionSuccess
} from '~~/shared/constants/entity-registry'
import { resolveEntityTypeLifecycleDefinition } from './entity-type-registry'
import { createCompletionRecord } from './completion-runtime-core'
import { applyCompletionPositiveTerminusEffects } from './completion-positive-terminus'
import { loadExtensionLifecycleEntity } from './extensions'
import {
  resolveExtensionEligibleAssigneeIds,
  resolveExtensionLifecycleRuntimeInTransaction
} from './extension-lifecycle-context'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { requireQualifiedRuntimeLockEvidence } from './qualified-runtime-transaction'

type DbClient = Kysely<Database> | Transaction<Database>
type RuntimeRow = Selectable<Database['Common_Runtime']>
type WorkflowRun = RuntimeRow & { egcs_cn_routing?: JsonValue | null, egcs_cn_completion: string | null | undefined }
export const requiresAgreementApprovalSubmissionPromotion = (
  run: Pick<WorkflowRun, 'egcs_cn_purpose' | 'egcs_cn_entitytype'>
): boolean => run.egcs_cn_purpose === 'approval_submission'
  && (run.egcs_cn_entitytype === 'fundingcaseagreement' || run.egcs_cn_entitytype === 'fundingcaseamendment')
type WorkflowSetupSelection = RuntimeWorkflowSetup & {
  publicationId: string
  publicationState: 'draft' | 'published' | 'retired'
  publicationVersionId: string
  publicationVersion: number
  hasUnpublishedChanges: boolean
  publicationDefinition: PublishedWorkflowConfiguration
  previousRuntimeId?: string
}
export type StartWorkflowOptions = {
  completionId?: string
  retry?: boolean
  retrySetupId?: string
  retryRuntimeId?: string
  purpose?: Workflow_Purpose
  selectedSetup?: WorkflowSetupSelection
}
type WorkflowTerminalState = Extract<RuntimeState, 'succeeded' | 'approved' | 'unsuccessful' | 'denied' | 'cancelled' | 'failed'>

const ACTIVE_RUNTIME_STATES: readonly RuntimeState[] = ['pending', 'active', 'awaiting_action', 'paused']
const RETRYABLE_RUNTIME_STATES: readonly RuntimeState[] = ['unsuccessful', 'denied', 'cancelled', 'failed']

const runtimeMetadata = (run: WorkflowRun) => ({
  runtimeId: String(run.id),
  runtimeState: run.egcs_cn_state,
  attempt: Number(run.egcs_cn_attempt),
  previousRuntimeId: run.egcs_cn_previousruntime === null ? null : String(run.egcs_cn_previousruntime)
})

const runtimeSummary = (run: WorkflowRun) => ({
  ...runtimeMetadata(run),
  initiatedBy: String(run.egcs_cn_initiatedby),
  sourcePublicationId: String(run.egcs_cn_sourcepublication),
  sourcePublicationVersionId: String(run.egcs_cn_sourcepublicationversion),
  sourceVersion: Number(run.egcs_cn_sourceversion),
  purpose: run.egcs_cn_purpose,
  startedAt: run.egcs_cn_startedat,
  completedAt: run.egcs_cn_completedat,
  completionId: run.egcs_cn_completion === null || run.egcs_cn_completion === undefined
    ? null
    : String(run.egcs_cn_completion)
})

/**
 * Projects attempts that precede the latest attempt, independent of which
 * historical attempt the client is currently displaying.
 * @param runs All attempts for the same target and purpose in newest-first order.
 * @returns Earlier attempts in query order.
 */
export const projectPreviousWorkflowRuns = (runs: WorkflowRun[]) =>
  runs.slice(1).map(runtimeSummary)

const runtimeItemSummary = (item: Selectable<Database['Common_Runtime_Item']>) => ({
  runtimeItemId: String(item.id),
  runtimeState: item.egcs_cn_state,
  parentRuntimeItemId: item.egcs_cn_parentruntimeitem === null ? null : String(item.egcs_cn_parentruntimeitem),
  kind: item.egcs_cn_kind,
  order: Number(item.egcs_cn_order),
  publicationId: String(item.egcs_cn_publication),
  publicationVersionId: String(item.egcs_cn_publicationversion),
  publicationVersion: Number(item.egcs_cn_version),
  startedAt: item.egcs_cn_startedat,
  completedAt: item.egcs_cn_completedat
})

const selectWorkflowRunById = async (
  db: DbClient,
  runId: string,
  lockRows = false
): Promise<WorkflowRun | null> => {
  let query = db.selectFrom('Common_Runtime')
    .innerJoin('Common_Workflow_Run', 'Common_Workflow_Run.id', 'Common_Runtime.id')
    .selectAll('Common_Runtime')
    .select(['Common_Workflow_Run.egcs_cn_completion', 'Common_Workflow_Run.egcs_cn_routing'])
    .where('Common_Runtime.id', '=', runId)
    .where('Common_Runtime.egcs_cn_kind', '=', 'workflow')
    .where('Common_Runtime._deleted', '=', false)
  if (lockRows) query = query.forUpdate(['Common_Runtime', 'Common_Workflow_Run'])
  return await query.executeTakeFirst() as WorkflowRun | null
}

export const readWorkflowRuntimeConfiguration = async (db: DbClient, run: WorkflowRun): Promise<PublishedWorkflowConfiguration> => {
  const version = await db.selectFrom('Common_Publication_Version')
    .select(['egcs_cn_definition', 'egcs_cn_publication', 'egcs_cn_version'])
    .where('id', '=', String(run.egcs_cn_sourcepublicationversion))
    .where('egcs_cn_publication', '=', String(run.egcs_cn_sourcepublication))
    .where('egcs_cn_kind', '=', 'workflow_setup')
    .where('egcs_cn_version', '=', Number(run.egcs_cn_sourceversion))
    .executeTakeFirstOrThrow()
  const definition = readPublishedWorkflowConfiguration(version.egcs_cn_definition)
  if (!definition.members.some(member => member.conditions?.length)) return definition
  const routing = run.egcs_cn_routing as WorkflowRoutingEvidence | null
  if (!routing) throw new WorkflowRouteValidationError('Conditional workflow runtime is missing captured routing evidence')
  return { ...definition, members: definition.members.filter(member => routing.decisions.some(decision => decision.memberId === member.memberId && decision.eligible)) }
}

export const isWorkflowStartStatusAllowed = (allowedStatuses: StatusId[], currentStatus: StatusId): boolean =>
  allowedStatuses.includes(currentStatus)

export const resolveWorkflowTargetStatus = async (
  db: DbClient,
  entityType: Entity_Type,
  entityId: string
): Promise<StatusId | null> => isBusinessStatusEntityType(entityType)
  ? await resolveBusinessStatusId(db, entityType, entityId)
  : null

export const isWorkflowRetryStatusEligible = (
  setup: Pick<RuntimeWorkflowSetup, 'egcs_cn_allowedstartstatuses'> | null,
  target: { statusId: StatusId | null, terminal: boolean } | undefined
): boolean => Boolean(
  setup
  && target?.statusId
  && !target.terminal
  && isWorkflowStartStatusAllowed(setup.egcs_cn_allowedstartstatuses, target.statusId)
)

const applyWorkflowParentStatusTransition = async (
  trx: Transaction<Database>,
  run: Pick<WorkflowRun, 'id' | 'egcs_cn_entitytype' | 'egcs_cn_entityid'>,
  status: StatusId | undefined,
  event: Workflow_Transition_Event,
  workflowItemId?: string,
  actor?: string
) => {
  if (!status) return null
  const transition = isBusinessStatusEntityType(run.egcs_cn_entitytype)
    ? await transitionBusinessStatus(trx, run.egcs_cn_entitytype, String(run.egcs_cn_entityid), status)
    : await (async () => {
        const evidence = requireQualifiedRuntimeLockEvidence(
          trx,
          run.egcs_cn_entitytype,
          String(run.egcs_cn_entityid)
        )
        const loaded = evidence.runtime.loaded
        const adapterContext = {
          event: null,
          transaction: trx as never,
          actorUserId: actor ?? ''
        }
        const lockedEntity = evidence.runtime.lockedEntity
        await loaded.adapter.mutateStatus(adapterContext, {
          lockedEntity,
          nextStatusId: String(status),
          runtimeId: String(run.id)
        })
        const nextStatus = await trx.selectFrom('Common_Status')
          .select('egcs_cn_terminal')
          .where('id', '=', String(status))
          .where('_deleted', '=', false)
          .executeTakeFirstOrThrow()
        return {
          previousStatusId: lockedEntity.status.statusId,
          nextStatusId: String(status),
          terminal: nextStatus.egcs_cn_terminal
        }
      })()
  await trx.insertInto('Common_Workflow_Status_Transition').values({
    egcs_cn_workflowrun: String(run.id),
    egcs_cn_workflowitem: workflowItemId ?? null,
    egcs_cn_event: event,
    egcs_cn_previousstatus: transition.previousStatusId,
    egcs_cn_newstatus: transition.nextStatusId,
    egcs_cn_actor: actor ?? null
  }).execute()
  return transition
}

const lockProtectedAgreement = async (trx: Transaction<Database>, run: Pick<WorkflowRun, 'egcs_cn_purpose' | 'egcs_cn_entitytype' | 'egcs_cn_entityid'>) => {
  if (run.egcs_cn_purpose === 'risk_rating' && run.egcs_cn_entitytype === 'fundingcaseagreement') {
    const observed = await trx.selectFrom('Funding_Case_Agreement_Profile')
      .select('egcs_fc_transferpaymentstream')
      .where('id', '=', String(run.egcs_cn_entityid)).where('_deleted', '=', false).executeTakeFirst()
    if (!observed) throw new Error('Risk Rating Agreement is unavailable')
    const streamId = String(observed.egcs_fc_transferpaymentstream)
    const stream = await trx.selectFrom('Transfer_Payment_Stream').select('id')
      .where('id', '=', streamId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!stream) throw new Error('Risk Rating Agreement Stream is unavailable')
    if (!await lockAgreementProfileForUpdate(trx, String(run.egcs_cn_entityid))) {
      throw new Error('Risk Rating Agreement is unavailable')
    }
    return streamId
  }
  if (run.egcs_cn_entitytype === 'fundingcaseagreementcloseout') {
    const closeout = await trx.selectFrom('Funding_Case_Agreement_Closeout')
      .select('egcs_fc_fundingagreement')
      .where('id', '=', String(run.egcs_cn_entityid))
      .where('_deleted', '=', false)
      .executeTakeFirstOrThrow()
    if (!await lockAgreementProfileForUpdate(trx, String(closeout.egcs_fc_fundingagreement))) {
      throw new Error('Closeout Agreement is unavailable')
    }
    return
  }
  if (!requiresAgreementApprovalSubmissionPromotion(run)) return
  const agreementId = run.egcs_cn_entitytype === 'fundingcaseagreement'
    ? String(run.egcs_cn_entityid)
    : String((await trx.selectFrom('Funding_Case_Agreement_Amendment')
        .select('egcs_fc_fundingagreement')
        .where('id', '=', String(run.egcs_cn_entityid))
        .where('_deleted', '=', false)
        .executeTakeFirstOrThrow()).egcs_fc_fundingagreement)
  if (!await lockAgreementProfileForUpdate(trx, agreementId)) {
    throw new AgreementApprovalSubmissionPromotionError('Agreement approval submission target is unavailable')
  }
  return null
}

const applyRiskRatingEffect = async (
  trx: Transaction<Database>,
  run: WorkflowRun,
  configuration: PublishedWorkflowConfiguration,
  lockedStreamId: string | null | undefined,
  actor?: string
): Promise<boolean> => {
  const effect = configuration.riskRatingEffect
  const fail = async (reason: string) => {
    await applyWorkflowParentStatusTransition(trx, run, configuration.executionFailureStatus, 'execution_failed', undefined, actor)
    await transitionRuntime(trx, {
      runtimeId: String(run.id), from: run.egcs_cn_state, to: 'failed', actorId: actor, reason
    })
    return false
  }
  if (!effect || run.egcs_cn_entitytype !== 'fundingcaseagreement') return await fail('risk_rating_configuration_invalid')
  const agreement = await trx.selectFrom('Funding_Case_Agreement_Profile')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream')
    .select(['Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream as streamId'])
    .where('Funding_Case_Agreement_Profile.id', '=', String(run.egcs_cn_entityid))
    .where('Funding_Case_Agreement_Profile._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .executeTakeFirst()
  if (!agreement || !lockedStreamId || String(agreement.streamId) !== lockedStreamId) {
    return await fail('risk_rating_target_stream_changed')
  }
  const review = await trx.selectFrom('Common_Review')
    .innerJoin('Common_Runtime_Item as Review_Item', 'Review_Item.id', 'Common_Review.egcs_cn_runtimeitem')
    .innerJoin('Common_Review_Set', 'Common_Review_Set.id', 'Common_Review.egcs_cn_reviewset')
    .innerJoin('Common_Runtime_Item as Set_Item', 'Set_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
    .select(['Common_Review.id', 'Common_Review.egcs_cn_reviewresult', 'Review_Item.egcs_cn_state'])
    .where('Review_Item.egcs_cn_runtime', '=', String(run.id))
    .where('Review_Item.egcs_cn_publicationversion', '=', effect.assessmentSchemaVersionId)
    .where('Set_Item.egcs_cn_publicationversion', '=', configuration.members
      .find(member => member.memberId === effect.workflowMemberId)?.publicationVersionId ?? '')
    .where('Common_Review._deleted', '=', false)
    .forUpdate(['Common_Review', 'Review_Item'])
    .executeTakeFirst()
  const assessmentScore = review?.egcs_cn_reviewresult === null || review?.egcs_cn_reviewresult === undefined
    ? Number.NaN
    : Number(review.egcs_cn_reviewresult)
  if (!review || !['succeeded', 'approved'].includes(review.egcs_cn_state) || !Number.isFinite(assessmentScore)) {
    return await fail('risk_rating_evidence_invalid')
  }
  const band = effect.bands.find(candidate => assessmentScore <= candidate.maximumScore)
  if (!band) return await fail('risk_rating_score_out_of_range')
  const rating = await trx.selectFrom('Transfer_Payment_Stream_Risk_Rating')
    .select(['id', 'egcs_tp_riskscore'])
    .where('id', '=', band.riskRatingId)
    .where('egcs_tp_transferpaymentstream', '=', String(agreement.streamId))
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!rating || Number(rating.egcs_tp_riskscore) !== band.riskScore) return await fail('risk_rating_configuration_stale')
  await trx.updateTable('Funding_Case_Agreement_Profile')
    .set({ egcs_fc_riskscore: band.riskScore })
    .where('id', '=', String(run.egcs_cn_entityid))
    .where('_deleted', '=', false)
    .executeTakeFirstOrThrow()
  return true
}

const validateCloseoutPacket = async (
  trx: Transaction<Database>,
  run: WorkflowRun,
  configuration: PublishedWorkflowConfiguration,
  actor?: string
) => {
  const snapshot = await trx.selectFrom('Funding_Case_Agreement_Closeout_Snapshot')
    .selectAll()
    .where('egcs_fc_workflowrun', '=', String(run.id))
    .executeTakeFirstOrThrow()
  const storedPacketHash = hashAgreementCloseoutSnapshot(
    snapshot.egcs_fc_packet as Parameters<typeof hashAgreementCloseoutSnapshot>[0]
  )
  const currentReadiness = await buildAgreementCloseoutReadiness(trx, String(snapshot.egcs_fc_fundingagreement))
  if (storedPacketHash === snapshot.egcs_fc_canonicalhash
    && currentReadiness?.ready
    && hashAgreementCloseoutSnapshot(currentReadiness) === snapshot.egcs_fc_canonicalhash) return true
  await applyWorkflowParentStatusTransition(
    trx,
    run,
    configuration.executionFailureStatus,
    'execution_failed',
    undefined,
    actor
  )
  await transitionRuntime(trx, {
    runtimeId: String(run.id),
    from: run.egcs_cn_state,
    to: 'failed',
    actorId: actor,
    reason: 'closeout_packet_changed'
  })
  return false
}

const promoteApprovalSubmission = async (trx: Transaction<Database>, run: WorkflowRun) => {
  const submission = await trx.selectFrom('Funding_Case_Agreement_Approval_Submission')
    .selectAll()
    .where('egcs_fc_workflowrun', '=', String(run.id))
    .executeTakeFirstOrThrow()
  const packet = submission.egcs_fc_packet as AgreementApprovalSnapshotV1
  if (hashAgreementApprovalSnapshot(packet) !== submission.egcs_fc_canonicalhash) {
    throw new AgreementApprovalSubmissionHashMismatchError('Agreement approval submission packet failed its integrity check')
  }
  const existingRevision = await trx.selectFrom('Funding_Case_Agreement_Revision')
    .select('id')
    .where('egcs_fc_approvalsubmission', '=', String(submission.id))
    .executeTakeFirst()
  if (existingRevision) return
  const agreementId = String(submission.egcs_fc_fundingagreement)
  const amendmentId = submission.egcs_fc_amendment === null ? null : String(submission.egcs_fc_amendment)
  const latest = await trx.selectFrom('Funding_Case_Agreement_Revision')
    .select('egcs_fc_revisionnumber')
    .where('egcs_fc_fundingagreement', '=', agreementId)
    .where('_deleted', '=', false)
    .orderBy('egcs_fc_revisionnumber', 'desc')
    .forUpdate()
    .executeTakeFirst()
  const revisionNumber = amendmentId ? Number(latest?.egcs_fc_revisionnumber ?? 0) + 1 : 0
  if (amendmentId) {
    const amendmentContext = await resolveAgreementAmendmentRuntimeContext(trx, amendmentId)
    const approvedDomains = packet.agreement === null
      ? {
          budgetVersionId: packet.sourceVersions.budget,
          activityVersionId: packet.sourceVersions.activity,
          duration: packet.amendment !== null && Object.hasOwn(packet.amendment, 'proposedAuthorizedAssistanceStartDate')
        }
      : undefined
    if (!amendmentContext || !await promoteApprovedAgreementAmendment(trx, amendmentContext, approvedDomains)) {
      throw new AgreementApprovalSubmissionPromotionError('Agreement amendment promotion failed')
    }
    await trx.updateTable('Funding_Case_Agreement_Amendment').set({
      egcs_fc_amendmentnumber: sql<number>`COALESCE(egcs_fc_amendmentnumber, ${revisionNumber})`,
      egcs_fc_isopen: false
    }).where('id', '=', amendmentId).execute()
  }
  await trx.insertInto('Funding_Case_Agreement_Revision').values({
    egcs_fc_fundingagreement: agreementId,
    egcs_fc_amendment: amendmentId,
    egcs_fc_approvalsubmission: String(submission.id),
    egcs_fc_revisionnumber: revisionNumber,
    _deleted: false
  }).execute()
}

export const finishWorkflowRun = async (
  trx: Transaction<Database>,
  runId: string,
  state: WorkflowTerminalState,
  fallbackEvent?: Extract<Workflow_Transition_Event, 'cancelled' | 'execution_failed'>,
  actor?: string
) => {
  const candidate = await selectWorkflowRunById(trx, runId)
  if (!candidate) return null
  const lockedRiskRatingStreamId = await lockProtectedAgreement(trx, candidate)
  const run = await selectWorkflowRunById(trx, runId, true)
  if (!run || RUNTIME_TERMINAL_STATES.has(run.egcs_cn_state)) return run
  const configuration = await readWorkflowRuntimeConfiguration(trx, run)
  const positive = state === 'succeeded' || state === 'approved'
  if (positive && run.egcs_cn_purpose === 'approval_submission'
    && run.egcs_cn_entitytype === 'fundingcaseagreementcloseout'
    && !await validateCloseoutPacket(trx, run, configuration, actor)) {
    return await selectWorkflowRunById(trx, runId)
  }
  if (positive && run.egcs_cn_purpose === 'risk_rating'
    && !await applyRiskRatingEffect(trx, run, configuration, lockedRiskRatingStreamId, actor)) {
    return await selectWorkflowRunById(trx, runId)
  }
  if (positive && requiresAgreementApprovalSubmissionPromotion(run)) {
    await promoteApprovalSubmission(trx, run)
  }
  if (positive && run.egcs_cn_completion !== null && run.egcs_cn_completion !== undefined) {
    if (isCoreEntityType(run.egcs_cn_entitytype)) {
      await applyCompletionPositiveTerminusEffects(trx, run.egcs_cn_entitytype, String(run.egcs_cn_entityid))
    } else {
      const evidence = requireQualifiedRuntimeLockEvidence(
        trx,
        run.egcs_cn_entitytype,
        String(run.egcs_cn_entityid)
      )
      const loaded = evidence.runtime.loaded
      if (loaded?.adapter.onPositiveTerminus) {
        const adapterContext = { event: null, transaction: trx as never, actorUserId: actor ?? '' }
        await loaded.adapter.onPositiveTerminus(adapterContext, {
          lockedEntity: evidence.runtime.lockedEntity,
          completionId: String(run.egcs_cn_completion), runtimeId: String(run.id)
        })
      }
    }
  }
  if (fallbackEvent) await applyWorkflowParentStatusTransition(
    trx,
    run,
    fallbackEvent === 'cancelled' ? configuration.cancellationStatus : configuration.executionFailureStatus,
    fallbackEvent,
    undefined,
    actor
  )
  await transitionRuntime(trx, {
    runtimeId: runId,
    from: run.egcs_cn_state,
    to: state,
    actorId: actor,
    reason: `workflow_${state}`
  })
  return await selectWorkflowRunById(trx, runId)
}

export const cancelWorkflowRun = async (
  trx: Transaction<Database>,
  run: Pick<WorkflowRun, 'id'>,
  actorId?: string
) => {
  const locked = await selectWorkflowRunById(trx, String(run.id), true)
  if (!locked || RUNTIME_TERMINAL_STATES.has(locked.egcs_cn_state)) return locked
  const configuration = await readWorkflowRuntimeConfiguration(trx, locked)
  await applyWorkflowParentStatusTransition(
    trx,
    locked,
    configuration.cancellationStatus,
    'cancelled',
    undefined,
    actorId
  )
  if (!actorId) {
    throw new Error('Canonical workflow cancellation requires an actor')
  }
  await cancelRuntimeTree(trx, { runtimeId: String(locked.id), actorId, reason: 'workflow_cancelled' })
  return await selectWorkflowRunById(trx, String(locked.id))
}

export const resolveActiveCompletionWorkflowForSource = async (
  db: DbClient,
  entityType: Entity_Type,
  entityId: string,
  purpose: Workflow_Purpose = 'standard',
  lockRows = false
) => {
  const context = await resolveReviewRuntimeEntityFromEntity(db as Kysely<Database>, entityType, entityId)
  return context ? await resolveActiveWorkflowSetup(db, context, purpose, lockRows) : null
}

export const startCompletionWorkflowForSource = async (
  event: H3Event,
  trx: Transaction<Database>,
  entityType: Entity_Type,
  entityId: string,
  initiatedBy: string,
  completionId: string,
  purpose: Workflow_Purpose = 'standard'
) => {
  const context = await resolveReviewRuntimeEntityFromEntity(trx, entityType, entityId)
  return context ? await startWorkflow(event, trx, context, initiatedBy, { completionId, purpose }) : null
}

/**
 * Creates immutable Completion evidence and atomically resolves its point-in-time Workflow.
 * @param event - Active request event.
 * @param trx - Open transaction holding the target and selection locks.
 * @param entityType - Exact completion target type.
 * @param entityId - Exact completion target identifier.
 * @param input - Actor and immutable completion comments.
 * @param input.initiatedBy - Common user creating Completion evidence.
 * @param input.comments - Comments captured with the Completion.
 * @returns The Completion and optional first Workflow attempt.
 */
export const createCompletionTransition = async (
  event: H3Event,
  trx: Transaction<Database>,
  entityType: Entity_Type,
  entityId: string,
  input: { initiatedBy: string, comments: string }
) => {
  const context = await resolveReviewRuntimeEntityFromEntity(trx, entityType, entityId)
  if (!context || !isCoreEntityType(context.entityType)) {
    return await throwApiError(event, {
      statusCode: 409,
      code: 'COMPLETION_ENTITY_ADAPTER_UNAVAILABLE',
      key: 'apiErrors.workflow.completion_entity_adapter_unavailable'
    })
  }
  const definition = getCoreEntityDefinition(context.entityType)
  if (definition.completion !== 'supported') {
    return await throwApiError(event, {
      statusCode: 409,
      code: 'COMPLETION_TRANSITION_MODE_INVALID',
      key: 'apiErrors.workflow.completion_transition_mode_invalid'
    })
  }
  const activeWorkflow = await trx.selectFrom('Common_Runtime')
    .select('id')
    .where('egcs_cn_kind', '=', 'workflow')
    .where('egcs_cn_entitytype', '=', context.entityType)
    .where('egcs_cn_entityid', '=', context.entityId)
    .where('egcs_cn_state', 'in', [...ACTIVE_RUNTIME_STATES])
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (activeWorkflow) {
    return await throwApiError(event, {
      statusCode: 409,
      code: 'WORKFLOW_ACTIVE',
      key: 'apiErrors.workflow.active_workflow'
    })
  }
  const setup = definition.approvalSubmission === 'on_completion'
    ? await resolveActiveWorkflowSetup(trx, context, 'approval_submission', true)
    : null
  if (!setup && requiresApprovalSubmissionAtCompletion(context.entityType)) {
    if (context.entityType !== 'fundingcaseagreementcloseout') {
      return await throwApiError(event, {
        statusCode: 409,
        code: 'COMPLETION_WORKFLOW_REQUIRED',
        key: 'apiErrors.workflow.completion_workflow_required'
      })
    }
    return await throwApiError(event, {
      statusCode: 409,
      code: 'CLOSEOUT_APPROVAL_WORKFLOW_REQUIRED',
      key: 'apiErrors.workflow.closeout_approval_required'
    })
  }
  const completion = await createCompletionRecord(trx, {
    entityType: context.entityType,
    entityId: context.entityId,
    comments: input.comments,
    userId: input.initiatedBy,
    disposition: setup ? 'workflow_started' : 'no_workflow'
  })
  if (!setup) {
    await applyCompletionPositiveTerminusEffects(trx, context.entityType, context.entityId)
    return { completion, workflow: null }
  }
  const workflow = await startWorkflow(event, trx, context, input.initiatedBy, {
    completionId: completion.id,
    purpose: 'approval_submission',
    selectedSetup: setup
  })
  if (!workflow) {
    return await throwApiError(event, {
      statusCode: 409,
      code: 'COMPLETION_WORKFLOW_MATERIALIZATION_FAILED',
      key: 'apiErrors.workflow.completion_workflow_materialization_failed'
    })
  }
  return { completion, workflow }
}

export const resolveActiveWorkflowSetup = async (
  db: DbClient,
  context: ReviewRuntimeEntityContext,
  purpose: Workflow_Purpose = 'standard',
  lockRows = false
): Promise<WorkflowSetupSelection | null> => {
  const scopes = await resolveReviewRuntimeSetupScopes(db as Kysely<Database>, context, lockRows)
  if (scopes.length === 0) return null
  const selectionKeys = scopes.map(scope => `${scope.scopeType}:${scope.scopeId}:${context.entityType}:${purpose}`)
  if (lockRows) {
    await lockPublicationSelectionKeys(
      db as Transaction<Database>,
      'workflow_setup',
      selectionKeys.map(key => ({ dimension: 'scope_entity_purpose', key }))
    )
  }
  let query = db.selectFrom('Common_Workflow_Setup')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Workflow_Setup.id')
    .innerJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Publication.egcs_cn_currentversion')
    .innerJoin('Common_Publication_Selection', 'Common_Publication_Selection.egcs_cn_publication', 'Common_Publication.id')
    .selectAll('Common_Workflow_Setup')
    .select([
      'Common_Publication.id as publicationId',
      'Common_Publication.egcs_cn_state as publicationState',
      'Common_Publication_Version.id as publicationVersionId',
      'Common_Publication_Version.egcs_cn_version as publicationVersion',
      'Common_Publication_Version.egcs_cn_definition as publicationDefinition'
    ])
    .where('Common_Workflow_Setup._deleted', '=', false)
    .where('Common_Publication.egcs_cn_kind', '=', 'workflow_setup')
    .where('Common_Publication.egcs_cn_state', '=', 'published')
    .where('Common_Publication._deleted', '=', false)
    .where('Common_Publication_Selection.egcs_cn_kind', '=', 'workflow_setup')
    .where('Common_Publication_Selection.egcs_cn_dimension', '=', 'scope_entity_purpose')
    .where('Common_Publication_Selection.egcs_cn_key', 'in', selectionKeys)
    .where(eb => eb.or(scopes.map(scope => eb.and([
      eb('Common_Workflow_Setup.egcs_cn_scopetype', '=', scope.scopeType),
      eb('Common_Workflow_Setup.egcs_cn_scopeid', '=', scope.scopeId)
    ]))))
    .orderBy('Common_Publication_Version.egcs_cn_version', 'desc')
  if (lockRows) query = query.forUpdate([
    'Common_Workflow_Setup',
    'Common_Publication',
    'Common_Publication_Version',
    'Common_Publication_Selection'
  ])
  const row = await query.executeTakeFirst()
  if (!row) return null
  const definition = readPublishedWorkflowConfiguration(row.publicationDefinition)
  if (definition.entityType !== context.entityType || (definition.purpose ?? 'standard') !== purpose) return null
  return {
    ...applyPublishedWorkflowConfiguration(row, definition),
    publicationId: String(row.publicationId),
    publicationState: row.publicationState,
    publicationVersionId: String(row.publicationVersionId),
    publicationVersion: Number(row.publicationVersion),
    hasUnpublishedChanges: false,
    publicationDefinition: definition
  }
}

/**
 * Returns the published standard-workflow catalog applicable to an exact target.
 * @param db Database or transaction used to read the immutable publication catalog.
 * @param context Exact authorized workflow target context.
 * @param workflowSetupId Optional explicit setup selection.
 * @param lockRows Whether publication rows must be locked for a protected start.
 * @returns Every applicable published standard setup, optionally narrowed to one selection.
 */
export const resolvePublishedStandardWorkflowSetups = async (
  db: DbClient,
  context: ReviewRuntimeEntityContext,
  workflowSetupId?: string,
  lockRows = false
): Promise<WorkflowSetupSelection[]> => {
  const scopes = await resolveReviewRuntimeSetupScopes(db as Kysely<Database>, context, lockRows)
  if (scopes.length === 0) return []
  let query = db.selectFrom('Common_Workflow_Setup')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Workflow_Setup.id')
    .innerJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Publication.egcs_cn_currentversion')
    .selectAll('Common_Workflow_Setup')
    .select([
      'Common_Publication.id as publicationId',
      'Common_Publication.egcs_cn_state as publicationState',
      'Common_Publication_Version.id as publicationVersionId',
      'Common_Publication_Version.egcs_cn_version as publicationVersion',
      'Common_Publication_Version.egcs_cn_definition as publicationDefinition'
    ])
    .where('Common_Workflow_Setup._deleted', '=', false)
    .where('Common_Workflow_Setup.egcs_cn_entitytype', '=', context.entityType)
    .where('Common_Workflow_Setup.egcs_cn_purpose', '=', 'standard')
    .where('Common_Publication.egcs_cn_kind', '=', 'workflow_setup')
    .where('Common_Publication.egcs_cn_state', '=', 'published')
    .where('Common_Publication._deleted', '=', false)
    .where(eb => eb.or(scopes.map(scope => eb.and([
      eb('Common_Workflow_Setup.egcs_cn_scopetype', '=', scope.scopeType),
      eb('Common_Workflow_Setup.egcs_cn_scopeid', '=', scope.scopeId)
    ]))))
    .orderBy('Common_Workflow_Setup.egcs_cn_name_en')
  if (workflowSetupId) query = query.where('Common_Workflow_Setup.id', '=', workflowSetupId)
  if (lockRows) query = query.forUpdate(['Common_Workflow_Setup', 'Common_Publication', 'Common_Publication_Version'])
  const rows = await query.execute()
  return rows.flatMap(row => {
    const definition = readPublishedWorkflowConfiguration(row.publicationDefinition)
    if (definition.entityType !== context.entityType || (definition.purpose ?? 'standard') !== 'standard') return []
    return [{
      ...applyPublishedWorkflowConfiguration(row, definition),
      publicationId: String(row.publicationId),
      publicationState: row.publicationState,
      publicationVersionId: String(row.publicationVersionId),
      publicationVersion: Number(row.publicationVersion),
      hasUnpublishedChanges: false,
      publicationDefinition: definition
    }]
  })
}

export const resolveRetryableWorkflowSetup = async (
  db: DbClient,
  context: ReviewRuntimeEntityContext,
  runtimeId?: string,
  lockRows = false,
  purpose: Workflow_Purpose = 'standard'
): Promise<WorkflowSetupSelection | null> => {
  let runQuery = db.selectFrom('Common_Runtime')
    .leftJoin('Common_Runtime as Successor_Runtime', join => join
      .onRef('Successor_Runtime.egcs_cn_previousruntime', '=', 'Common_Runtime.id')
      .on('Successor_Runtime._deleted', '=', false))
    .innerJoin('Common_Workflow_Run', 'Common_Workflow_Run.id', 'Common_Runtime.id')
    .innerJoin('Common_Workflow_Setup', 'Common_Workflow_Setup.id', 'Common_Runtime.egcs_cn_sourcepublication')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Runtime.egcs_cn_sourcepublication')
    .innerJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Runtime.egcs_cn_sourcepublicationversion')
    .selectAll('Common_Workflow_Setup')
    .select([
      'Common_Runtime.id as previousRuntimeId',
      'Common_Runtime.egcs_cn_state as previousRuntimeState',
      'Common_Publication.id as publicationId',
      'Common_Publication.egcs_cn_state as publicationState',
      'Common_Publication_Version.id as publicationVersionId',
      'Common_Publication_Version.egcs_cn_version as publicationVersion',
      'Common_Publication_Version.egcs_cn_definition as publicationDefinition'
    ])
    .where('Common_Runtime.egcs_cn_kind', '=', 'workflow')
    .where('Common_Runtime.egcs_cn_entitytype', '=', context.entityType)
    .where('Common_Runtime.egcs_cn_entityid', '=', context.entityId)
    .where('Common_Runtime.egcs_cn_purpose', '=', purpose)
    .where('Common_Runtime.egcs_cn_state', 'in', [...RETRYABLE_RUNTIME_STATES])
    .where('Common_Runtime._deleted', '=', false)
    .where('Successor_Runtime.id', 'is', null)
    .where('Common_Workflow_Setup._deleted', '=', false)
    .where('Common_Publication._deleted', '=', false)
    .where('Common_Publication_Version.egcs_cn_kind', '=', 'workflow_setup')
    .whereRef('Common_Publication_Version.egcs_cn_publication', '=', 'Common_Runtime.egcs_cn_sourcepublication')
    .whereRef('Common_Publication_Version.egcs_cn_version', '=', 'Common_Runtime.egcs_cn_sourceversion')
  runQuery = runtimeId
    ? runQuery
        .where('Common_Runtime.id', '=', runtimeId)
        .where(({ not, exists, selectFrom }) => not(exists(
          selectFrom('Common_Runtime as Newer_Runtime')
            .select('Newer_Runtime.id')
            .whereRef('Newer_Runtime.egcs_cn_entitytype', '=', 'Common_Runtime.egcs_cn_entitytype')
            .whereRef('Newer_Runtime.egcs_cn_entityid', '=', 'Common_Runtime.egcs_cn_entityid')
            .whereRef('Newer_Runtime.egcs_cn_purpose', '=', 'Common_Runtime.egcs_cn_purpose')
            .whereRef('Newer_Runtime.id', '>', 'Common_Runtime.id')
            .where('Newer_Runtime.egcs_cn_kind', '=', 'workflow')
            .where('Newer_Runtime._deleted', '=', false)
        )))
    : runQuery.orderBy('Common_Runtime.id', 'desc')
  if (lockRows) runQuery = runQuery.forUpdate(['Common_Runtime', 'Common_Workflow_Run'])
  const row = await runQuery.executeTakeFirst()
  if (!row) return null
  // Retry authorization is evaluated against the target's current owner scope by the caller.
  // Configuration applicability remains historical: a retry must retain the predecessor's exact
  // pinned setup even when the target has since moved between otherwise-authorized scopes.
  const definition = readPublishedWorkflowConfiguration(row.publicationDefinition)
  if (!definition.allowRetry) return null
  return {
    ...applyPublishedWorkflowConfiguration(row, definition),
    publicationId: String(row.publicationId),
    publicationState: row.publicationState,
    publicationVersionId: String(row.publicationVersionId),
    publicationVersion: Number(row.publicationVersion),
    hasUnpublishedChanges: false,
    publicationDefinition: definition,
    previousRuntimeId: String(row.previousRuntimeId)
  }
}

const pauseForInvalidOwners = async (
  trx: Transaction<Database>,
  run: WorkflowRun,
  member: PublishedWorkflowMember,
  nestedMemberIds: string[],
  actorId?: string
) => {
  const ownerByMember = new Map(member.owners.map(owner => [
    owner.nestedMemberId,
    owner.defaultOwner ?? String(run.egcs_cn_initiatedby)
  ]))
  const ownerIds = nestedMemberIds.map(id => ownerByMember.get(id) ?? String(run.egcs_cn_initiatedby))
  const eligible = isAssignableEntityType(run.egcs_cn_entitytype)
    ? await resolveAgencyValidEntityAssigneeIdsWithDb(
        trx,
        run.egcs_cn_entitytype,
        String(run.egcs_cn_entityid),
        ownerIds
      )
    : run.egcs_cn_entitytype.includes(':')
      ? await (async () => {
          const runtime = await resolveExtensionLifecycleRuntimeInTransaction(
            trx,
            run.egcs_cn_entitytype,
            String(run.egcs_cn_entityid),
            actorId ?? String(run.egcs_cn_initiatedby)
          )
          return runtime ? await resolveExtensionEligibleAssigneeIds(trx, runtime, ownerIds) : new Set<string>()
        })()
      : new Set<string>()
  const invalid = nestedMemberIds.filter((id, index) => !eligible.has(ownerIds[index]!))
  if (invalid.length === 0) return ownerByMember
  for (const nestedMemberId of invalid) {
    await trx.insertInto('Common_Workflow_Owner_Blocker').values({
      egcs_cn_workflowrun: String(run.id),
      egcs_cn_workflowsetupmember: member.memberId,
      egcs_cn_reviewsetup: member.kind === 'review_set' ? nestedMemberId : null,
      egcs_cn_recommendationsetup: member.kind === 'recommendation_set' ? nestedMemberId : null,
      egcs_cn_configuredowner: ownerByMember.get(nestedMemberId) ?? null,
      egcs_cn_reason: 'owner_ineligible',
      egcs_cn_triggeredby: actorId ?? null,
      _deleted: false
    }).onConflict(oc => oc.doNothing()).execute()
  }
  await transitionRuntime(trx, {
    runtimeId: String(run.id),
    from: run.egcs_cn_state,
    to: 'paused',
    actorId,
    reason: 'owner_ineligible'
  })
  return null
}

type MaterializationResult = { kind: 'materialized', runtimeItemId: string } | { kind: 'paused' } | { kind: 'failed' }

const materializeWorkflowMember = async (
  trx: Transaction<Database>,
  run: WorkflowRun,
  member: PublishedWorkflowMember,
  actorId?: string
): Promise<WorkflowRun | null> => {
  const context = run.egcs_cn_entitytype.includes(':')
    ? (await resolveExtensionLifecycleRuntimeInTransaction(
        trx,
        run.egcs_cn_entitytype,
        String(run.egcs_cn_entityid),
        actorId ?? String(run.egcs_cn_initiatedby)
      ))?.context ?? null
    : await resolveReviewRuntimeEntityFromEntity(trx, run.egcs_cn_entitytype, String(run.egcs_cn_entityid))
  if (!context) return await finishWorkflowRun(trx, String(run.id), 'failed', 'execution_failed', actorId)
  let result: MaterializationResult
  if (member.kind === 'review_set') {
    if (!member.reviewPlan) result = { kind: 'failed' }
    else {
      const ownerAgencyId = getReviewRuntimeOwnerAgencyId(context)
      const setupScopes = await resolveReviewRuntimeSetupScopes(trx, context, true)
      const owners = ownerAgencyId
        ? await pauseForInvalidOwners(trx, run, member, member.reviewPlan.members.map(item => item.memberId), actorId)
        : null
      if (!owners) result = ownerAgencyId ? { kind: 'paused' } : { kind: 'failed' }
      else {
        const created = await createRuntimeReviewSetInTransaction({
          db: trx,
          reviewSetSetupId: member.referenceId,
          entityType: context.entityType,
          entityId: context.entityId,
          ownerAgencyId: String(ownerAgencyId),
          setupScopes,
          publication: member.reviewPlan,
          publicationVersionId: member.publicationVersionId,
          publicationVersion: member.publicationVersion,
          runtimeId: String(run.id),
          runtimeItemOrder: member.sequence,
          ownerByMemberId: owners,
          creatorCommonUserId: String(run.egcs_cn_initiatedby)
        })
        result = created && created !== 'IN_PROGRESS_EXISTS'
          ? { kind: 'materialized', runtimeItemId: String(created.runtimeItemId) }
          : { kind: 'failed' }
      }
    }
  } else if (member.kind === 'recommendation_set') {
    if (!member.recommendationPlan) result = { kind: 'failed' }
    else {
      const ownerAgencyId = getReviewRuntimeOwnerAgencyId(context)
      const setupScopes = await resolveReviewRuntimeSetupScopes(trx, context, true)
      const owners = ownerAgencyId
        ? await pauseForInvalidOwners(trx, run, member, member.recommendationPlan.members.map(item => item.memberId), actorId)
        : null
      if (!owners) result = ownerAgencyId ? { kind: 'paused' } : { kind: 'failed' }
      else {
        const created = await createRuntimeRecommendationSetInTransaction({
          db: trx,
          recommendationSetSetupId: member.referenceId,
          entityType: context.entityType,
          entityId: context.entityId,
          ownerAgencyId: String(ownerAgencyId),
          setupScopes,
          publication: member.recommendationPlan,
          publicationVersionId: member.publicationVersionId,
          publicationVersion: member.publicationVersion,
          runtimeId: String(run.id),
          runtimeItemOrder: member.sequence,
          ownerByMemberId: owners,
          creatorCommonUserId: String(run.egcs_cn_initiatedby)
        })
        result = created && created !== 'IN_PROGRESS_EXISTS'
          ? { kind: 'materialized', runtimeItemId: String(created.runtimeItemId) }
          : { kind: 'failed' }
      }
    }
  } else if (!member.approval) result = { kind: 'failed' }
  else {
    const created = await materializeCanonicalApprovalRuntime(trx, {
      entityType: run.egcs_cn_entitytype,
      entityId: String(run.egcs_cn_entityid),
      nameEn: member.approval.nameEn,
      nameFr: member.approval.nameFr,
      approvalTemplateId: member.referenceId,
      approvalTemplateVersionId: member.publicationVersionId,
      actorId: actorId ?? String(run.egcs_cn_initiatedby),
      purpose: run.egcs_cn_purpose,
      existingRuntimeId: String(run.id),
      runtimeItemOrder: member.sequence
    })
    result = { kind: 'materialized', runtimeItemId: String(created.runtimeItemId) }
  }
  if (result.kind === 'paused') return await selectWorkflowRunById(trx, String(run.id))
  if (result.kind === 'failed') return await finishWorkflowRun(trx, String(run.id), 'failed', 'execution_failed', actorId)
  const transition = await applyWorkflowParentStatusTransition(
    trx,
    run,
    member.materializationStatus,
    'materialized',
    result.runtimeItemId,
    actorId
  )
  if (transition?.terminal) throw new Error('A workflow materialization status cannot be terminal')
  return await selectWorkflowRunById(trx, String(run.id))
}

const createWorkflowRuntime = async (
  trx: Transaction<Database>,
  setup: WorkflowSetupSelection,
  context: ReviewRuntimeEntityContext,
  initiatedBy: string,
  purpose: Workflow_Purpose,
  completionId?: string,
  routing?: WorkflowRoutingEvidence
): Promise<WorkflowRun> => {
  let metadata: RuntimeMetadata
  let resolvedCompletionId = completionId ?? null
  if (setup.previousRuntimeId) {
    const previous = await selectWorkflowRunById(trx, setup.previousRuntimeId, true)
    if (!previous || !RETRYABLE_RUNTIME_STATES.includes(previous.egcs_cn_state)) {
      throw new Error('Only an eligible terminal workflow may be retried')
    }
    metadata = await retryRuntime(trx, {
      previousRuntimeId: String(previous.id),
      initiatedBy,
      cloneItems: false
    })
    resolvedCompletionId = previous.egcs_cn_completion === null || previous.egcs_cn_completion === undefined
      ? null
      : String(previous.egcs_cn_completion)
  } else {
    metadata = await createRuntime(trx, {
      kind: 'workflow',
      entityType: context.entityType,
      entityId: context.entityId,
      purpose,
      sourcePublicationId: setup.publicationId,
      sourcePublicationKind: 'workflow_setup',
      sourcePublicationVersionId: setup.publicationVersionId,
      sourceVersion: setup.publicationVersion,
      initiatedBy
    })
  }
  await trx.insertInto('Common_Workflow_Run').values({
    id: metadata.runtimeId,
    egcs_cn_routing: routing as unknown as JsonValue,
    egcs_cn_completion: resolvedCompletionId
  }).execute()
  return await selectWorkflowRunById(trx, metadata.runtimeId, true) as WorkflowRun
}

const startWorkflowUnchecked = async (
  event: H3Event,
  trx: Transaction<Database>,
  context: ReviewRuntimeEntityContext,
  initiatedBy: string,
  options: StartWorkflowOptions = {}
) => {
  const {
    completionId,
    retry = false,
    retrySetupId,
    retryRuntimeId,
    purpose = 'standard',
    selectedSetup
  } = options
  const entityDefinition = await resolveEntityTypeLifecycleDefinition(trx, context.entityType)
  const purposeSupported = entityDefinition && (
    (purpose === 'standard' && entityDefinition.standardWorkflow === 'explicit')
    || (purpose === 'approval_submission' && entityDefinition.approvalSubmission !== 'none')
    || (purpose === 'risk_rating' && entityDefinition.riskRating === 'explicit')
  )
  if (!purposeSupported) {
    return null
  }
  if (completionId && (purpose !== 'approval_submission' || entityDefinition.approvalSubmission !== 'on_completion')) {
    return null
  }
  const setup = selectedSetup ?? (retry
    ? await resolveRetryableWorkflowSetup(trx, context, retryRuntimeId, true, purpose)
    : purpose === 'standard'
      ? null
      : await resolveActiveWorkflowSetup(trx, context, purpose, true))
  if (!setup || (retry && String(setup.id) !== retrySetupId)) return null
  const targetStatus = isBusinessStatusEntityType(context.entityType)
    ? await lockBusinessStatus(trx, context.entityType, context.entityId, 'workflow')
    : await (async () => {
        const loaded = await loadExtensionLifecycleEntity(context.entityType)
        if (!loaded) return null
        const locked = await loaded.adapter.lockEntity({
          event,
          transaction: trx as never,
          actorUserId: initiatedBy
        }, {
          entityType: context.entityType as `${string}:${string}`,
          entityId: context.entityId
        })
        return locked ? { statusId: locked.status.statusId, terminal: locked.status.terminal } : null
      })()
  if (!targetStatus) return await badRequest(event, 'WORKFLOW_TARGET_TYPE_NOT_SUPPORTED', 'apiErrors.request.invalid_resource')
  const existing = await trx.selectFrom('Common_Runtime')
    .innerJoin('Common_Workflow_Run', 'Common_Workflow_Run.id', 'Common_Runtime.id')
    .selectAll('Common_Runtime')
    .select(['Common_Workflow_Run.egcs_cn_completion', 'Common_Workflow_Run.egcs_cn_routing'])
    .where('Common_Runtime.egcs_cn_entitytype', '=', context.entityType)
    .where('Common_Runtime.egcs_cn_entityid', '=', context.entityId)
    .where('Common_Runtime.egcs_cn_kind', '=', 'workflow')
    .where('Common_Runtime.egcs_cn_state', 'in', [...ACTIVE_RUNTIME_STATES])
    .where('Common_Runtime._deleted', '=', false)
    .forUpdate(['Common_Runtime', 'Common_Workflow_Run'])
    .executeTakeFirst() as WorkflowRun | undefined
  if (existing) {
    return await throwApiError(event, {
      statusCode: 409,
      code: 'WORKFLOW_ACTIVE',
      key: 'apiErrors.workflow.active_workflow'
    })
  }
  if (!targetStatus.statusId
    || !isWorkflowStartStatusAllowed(setup.egcs_cn_allowedstartstatuses, targetStatus.statusId)) {
    return await throwApiError(event, {
      statusCode: 409,
      code: 'WORKFLOW_START_STATUS_INELIGIBLE',
      key: 'apiErrors.workflow.start_status_ineligible'
    })
  }
  if ('status' in targetStatus ? targetStatus.status.terminal : targetStatus.terminal) {
    return await badRequest(event, 'WORKFLOW_TARGET_TERMINAL', 'apiErrors.request.invalid_status')
  }
  const closeoutReadiness = purpose === 'approval_submission'
    && context.entityType === 'fundingcaseagreementcloseout'
    ? await (async () => {
        const closeout = await trx.selectFrom('Funding_Case_Agreement_Closeout')
          .select('egcs_fc_fundingagreement')
          .where('id', '=', context.entityId)
          .where('_deleted', '=', false)
          .executeTakeFirstOrThrow()
        const readiness = await buildAgreementCloseoutReadiness(trx, String(closeout.egcs_fc_fundingagreement))
        if (readiness?.ready) return readiness
        const t = await useTranslation(event)
        return await throwApiError(event, {
          statusCode: 409,
          code: 'AGREEMENT_CLOSEOUT_NOT_READY',
          key: 'apiErrors.agreement.closeout_not_ready',
          details: [
            ...(readiness?.financial.ready === false
              ? [{ path: 'financial', code: 'FINANCIAL_NOT_RECONCILED', message: t('apiErrors.agreement.closeout_financial_not_reconciled') }]
              : []),
            ...(readiness?.outstandingFollowups.map(item => ({
              path: `followups.${item.id}`,
              code: 'FOLLOWUP_OUTSTANDING',
              message: `${t('agreement.closeout.outstanding_followups')}: ${item.name}`
            })) ?? []),
            ...(readiness?.blockers.map(item => ({
              path: `children.${item.entityType}.${item.entityId}`,
              code: item.reason,
              message: `${item.labelEn} / ${item.labelFr}: ${t(`agreement.closeout.blocker_reasons.${item.reason}`)}`
            })) ?? [])
          ]
        })
      })()
    : null
  let routing: WorkflowRoutingEvidence
  try {
    routing = await captureWorkflowRouting(trx, context, setup.publicationDefinition)
  } catch (error) {
    if (!(error instanceof WorkflowRouteValidationError)) throw error
    return await badRequest(event, 'WORKFLOW_ROUTE_INVALID', 'apiErrors.workflow.route_invalid')
  }
  const run = await createWorkflowRuntime(trx, setup, context, initiatedBy, purpose, completionId, routing)
  if (closeoutReadiness) {
    await trx.insertInto('Funding_Case_Agreement_Closeout_Snapshot').values({
      egcs_fc_fundingagreement: closeoutReadiness.agreementId,
      egcs_fc_closeout: context.entityId,
      egcs_fc_workflowrun: String(run.id),
      egcs_fc_snapshotschemaversion: closeoutReadiness.schemaVersion,
      egcs_fc_packet: closeoutReadiness as unknown as JsonValue,
      egcs_fc_canonicalhash: hashAgreementCloseoutSnapshot(closeoutReadiness)
    }).execute()
  }
  if (purpose === 'approval_submission' && ['fundingcaseagreement', 'fundingcaseamendment'].includes(context.entityType)) {
    const snapshot = await buildAgreementApprovalSnapshot(
      event,
      trx,
      context.entityType as 'fundingcaseagreement' | 'fundingcaseamendment',
      context.entityId
    )
    await trx.insertInto('Funding_Case_Agreement_Approval_Submission').values({
      egcs_fc_fundingagreement: snapshot.agreementId,
      egcs_fc_amendment: snapshot.amendmentId,
      egcs_fc_workflowrun: String(run.id),
      egcs_fc_snapshotschemaversion: 1,
      egcs_fc_packet: snapshot.packet as JsonValue,
      egcs_fc_canonicalhash: snapshot.hash
    }).execute()
  }
  await transitionRuntime(trx, {
    runtimeId: String(run.id),
    from: 'pending',
    to: 'active',
    actorId: initiatedBy,
    reason: retry ? 'workflow_retried' : 'workflow_started'
  })
  const activeRun = await selectWorkflowRunById(trx, String(run.id), true)
  const firstMember = setup.publicationDefinition.members.find(member => routing.decisions.some(decision => decision.memberId === member.memberId && decision.eligible))
  return activeRun && firstMember
    ? await materializeWorkflowMember(trx, activeRun, firstMember, initiatedBy)
    : await finishWorkflowRun(trx, String(run.id), 'succeeded', undefined, initiatedBy)
}

/**
 * Starts a workflow and converts stale publication graphs into a stable localized conflict for every caller.
 * @param args - Canonical workflow start arguments.
 * @returns The existing, newly started, or completed workflow projection.
 */
export const startWorkflow = async (...args: Parameters<typeof startWorkflowUnchecked>): Promise<Awaited<ReturnType<typeof startWorkflowUnchecked>>> => {
  try {
    return await startWorkflowUnchecked(...args)
  } catch (error) {
    if (getDatabaseConstraintName(error) === 'cn_idx_workflow_runtime_active_target') {
      return await throwApiError(args[0], {
        statusCode: 409,
        code: 'WORKFLOW_ACTIVE',
        key: 'apiErrors.workflow.active_workflow'
      })
    }
    if (getDatabaseConstraintName(error) === 'cn_chk_runtimeitempublished') {
      return await throwApiError(args[0], {
        statusCode: 409,
        code: 'WORKFLOW_PUBLICATION_UNAVAILABLE',
        key: 'apiErrors.request.invalid_status'
      })
    }
    throw error
  }
}

const findMemberForItem = (configuration: PublishedWorkflowConfiguration, item: {
  egcs_cn_order: number
  egcs_cn_kind: Database['Common_Runtime_Item']['egcs_cn_kind']
  egcs_cn_publication: string | number
}) => configuration.members.find(member => member.sequence === Number(item.egcs_cn_order)
  && member.referenceId === String(item.egcs_cn_publication)
  && ((member.kind === 'review_set' && item.egcs_cn_kind === 'review_set')
    || (member.kind === 'recommendation_set' && item.egcs_cn_kind === 'recommendation_set')
    || (member.kind === 'approval_template' && item.egcs_cn_kind === 'routing_slip')))

const positiveWorkflowState = async (trx: Transaction<Database>, runtimeId: string): Promise<'succeeded' | 'approved'> => {
  const approvals = await trx.selectFrom('Common_Runtime_Item')
    .select('id')
    .where('egcs_cn_runtime', '=', runtimeId)
    .where('egcs_cn_parentruntimeitem', 'is', null)
    .where('egcs_cn_state', '=', 'approved')
    .where('_deleted', '=', false)
    .executeTakeFirst()
  return approvals ? 'approved' : 'succeeded'
}

export const advanceWorkflowItem = async (
  trx: Transaction<Database>,
  runtimeItemId: string,
  actorId?: string
): Promise<WorkflowRun | null> => {
  const candidate = await trx.selectFrom('Common_Runtime_Item')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Common_Runtime_Item.egcs_cn_runtime')
    .select([
      'Common_Runtime_Item.id',
      'Common_Runtime_Item.egcs_cn_runtime',
      'Common_Runtime_Item.egcs_cn_parentruntimeitem',
      'Common_Runtime_Item.egcs_cn_kind',
      'Common_Runtime_Item.egcs_cn_order',
      'Common_Runtime_Item.egcs_cn_publication',
      'Common_Runtime_Item.egcs_cn_state',
      'Common_Runtime.egcs_cn_entitytype',
      'Common_Runtime.egcs_cn_entityid'
    ])
    .where('Common_Runtime_Item.id', '=', runtimeItemId)
    .where('Common_Runtime_Item._deleted', '=', false)
    .executeTakeFirst()
  if (!candidate || candidate.egcs_cn_parentruntimeitem !== null
    || !RUNTIME_TERMINAL_STATES.has(candidate.egcs_cn_state)) return null
  if (isBusinessStatusEntityType(candidate.egcs_cn_entitytype)) {
    await lockBusinessStatus(trx, candidate.egcs_cn_entitytype, String(candidate.egcs_cn_entityid), 'engine')
  }
  const run = await selectWorkflowRunById(trx, String(candidate.egcs_cn_runtime), true)
  if (!run || run.egcs_cn_state !== 'active') return null
  const item = await trx.selectFrom('Common_Runtime_Item').selectAll()
    .where('id', '=', runtimeItemId)
    .where('egcs_cn_runtime', '=', String(run.id))
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!item || !RUNTIME_TERMINAL_STATES.has(item.egcs_cn_state)) return null
  const configuration = await readWorkflowRuntimeConfiguration(trx, run)
  const member = findMemberForItem(configuration, item)
  if (!member) return await finishWorkflowRun(trx, String(run.id), 'failed', 'execution_failed', actorId)
  const nextMember = configuration.members.find(candidateMember => candidateMember.sequence > member.sequence)
  if (nextMember) {
    const alreadyAdvanced = await trx.selectFrom('Common_Runtime_Item').select('id')
      .where('egcs_cn_runtime', '=', String(run.id))
      .where('egcs_cn_parentruntimeitem', 'is', null)
      .where('egcs_cn_order', '=', nextMember.sequence)
      .where('_deleted', '=', false)
      .executeTakeFirst()
    if (alreadyAdvanced) return run
  }
  if (item.egcs_cn_state === 'cancelled') {
    return await finishWorkflowRun(trx, String(run.id), 'cancelled', 'cancelled', actorId)
  }
  if (item.egcs_cn_state === 'failed' || item.egcs_cn_state === 'denied' || item.egcs_cn_state === 'unsuccessful') {
    await applyWorkflowParentStatusTransition(trx, run, member.failureStatus, 'failed', String(item.id), actorId)
    return await finishWorkflowRun(
      trx,
      String(run.id),
      item.egcs_cn_state,
      member.failureStatus ? undefined : 'execution_failed',
      actorId
    )
  }
  if (nextMember) {
    const transition = await applyWorkflowParentStatusTransition(
      trx,
      run,
      member.successStatus,
      'succeeded',
      String(item.id),
      actorId
    )
    if (transition?.terminal) {
      return await finishWorkflowRun(trx, String(run.id), await positiveWorkflowState(trx, String(run.id)), undefined, actorId)
    }
    return await materializeWorkflowMember(trx, run, nextMember, actorId)
  }
  const transition = await applyWorkflowParentStatusTransition(
    trx,
    run,
    member.successStatus,
    'succeeded',
    String(item.id),
    actorId
  )
  const finished = await finishWorkflowRun(
    trx,
    String(run.id),
    await positiveWorkflowState(trx, String(run.id)),
    undefined,
    actorId
  )
  if (!finished || finished.egcs_cn_state === 'failed') return finished
  if (run.egcs_cn_purpose === 'approval_submission'
    && isCoreEntityType(run.egcs_cn_entitytype)
    && requiresTerminalApprovalSubmissionSuccess(run.egcs_cn_entitytype)
    && !transition?.terminal) {
    throw new Error('Workflow approval-submission success status is not terminal for this entity type')
  }
  if (run.egcs_cn_purpose === 'approval_submission'
    && run.egcs_cn_entitytype === 'fundingcaseagreementcloseout') {
    if (!transition) throw new Error('Closeout workflow success status transition is unavailable')
    const closeout = await trx.selectFrom('Funding_Case_Agreement_Closeout')
      .select('egcs_fc_fundingagreement')
      .where('id', '=', String(run.egcs_cn_entityid))
      .where('_deleted', '=', false)
      .executeTakeFirstOrThrow()
    const agreementTransition = await transitionBusinessStatus(
      trx,
      'fundingcaseagreement',
      String(closeout.egcs_fc_fundingagreement),
      transition.nextStatusId
    )
    if (!agreementTransition.terminal) throw new Error('Closeout Agreement status is not terminal')
  }
  return await selectWorkflowRunById(trx, String(run.id))
}

export const resumeWorkflowRun = async (
  trx: Transaction<Database>,
  runId: string,
  replacements: Array<{ blockerId: string, ownerId: string }>,
  resolvedBy: string
) => {
  const run = await selectWorkflowRunById(trx, runId, true)
  if (!run || run.egcs_cn_state !== 'paused') return null
  const blockers = await trx.selectFrom('Common_Workflow_Owner_Blocker').selectAll()
    .where('egcs_cn_workflowrun', '=', runId)
    .where('egcs_cn_resolvedat', 'is', null)
    .where('_deleted', '=', false)
    .orderBy('id', 'asc')
    .forUpdate()
    .execute()
  const replacementByBlocker = new Map(replacements.map(replacement => [replacement.blockerId, replacement.ownerId]))
  if (blockers.length === 0 || blockers.some(blocker => !replacementByBlocker.has(String(blocker.id)))) return null
  const configuration = await readWorkflowRuntimeConfiguration(trx, run)
  const member = configuration.members.find(candidate => candidate.memberId === String(blockers[0]!.egcs_cn_workflowsetupmember))
  if (!member || blockers.some(blocker => String(blocker.egcs_cn_workflowsetupmember) !== member.memberId)) return null
  if (!isAssignableEntityType(run.egcs_cn_entitytype)) return null
  const replacementIds = [...replacementByBlocker.values()]
  if (replacementIds.some(ownerId => !isPositivePostgresBigintText(ownerId))) return null
  const eligible = await resolveAgencyValidEntityAssigneeIdsWithDb(
    trx,
    run.egcs_cn_entitytype,
    String(run.egcs_cn_entityid),
    replacementIds
  )
  if (replacementIds.some(ownerId => !eligible.has(ownerId))) return null
  const effectiveOwners = new Map(member.owners.map(owner => [owner.nestedMemberId, owner.defaultOwner]))
  const now = new Date()
  for (const blocker of blockers) {
    const replacement = replacementByBlocker.get(String(blocker.id))!
    effectiveOwners.set(String(blocker.egcs_cn_reviewsetup ?? blocker.egcs_cn_recommendationsetup), replacement)
    await trx.updateTable('Common_Workflow_Owner_Blocker').set({
      egcs_cn_replacementowner: replacement,
      egcs_cn_resolvedby: resolvedBy,
      egcs_cn_resolvedat: now
    }).where('id', '=', String(blocker.id)).execute()
  }
  await transitionRuntime(trx, {
    runtimeId: runId,
    from: 'paused',
    to: 'active',
    actorId: resolvedBy,
    reason: 'owner_blocker_resolved'
  })
  const effectiveMember: PublishedWorkflowMember = {
    ...member,
    owners: [...effectiveOwners].map(([nestedMemberId, defaultOwner]) => ({
      nestedMemberId,
      ...(defaultOwner ? { defaultOwner } : {})
    }))
  }
  const rootItem = await trx.selectFrom('Common_Runtime_Item').selectAll()
    .where('egcs_cn_runtime', '=', runId)
    .where('egcs_cn_parentruntimeitem', 'is', null)
    .where('egcs_cn_order', '=', member.sequence)
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (rootItem?.egcs_cn_kind === 'review_set') {
    const blocker = blockers[0]!
    const reviewSet = await trx.selectFrom('Common_Review_Set').select('id')
      .where('egcs_cn_runtimeitem', '=', String(rootItem.id)).executeTakeFirst()
    const resumed = reviewSet && await resumeSequentialRuntimeReviewSet(
      trx,
      String(reviewSet.id),
      String(blocker.egcs_cn_reviewsetup),
      replacementByBlocker.get(String(blocker.id))!
    )
    return resumed ? await selectWorkflowRunById(trx, runId) : null
  }
  const activeRun = await selectWorkflowRunById(trx, runId, true)
  return activeRun ? await materializeWorkflowMember(trx, activeRun, effectiveMember, resolvedBy) : null
}

export const advanceWorkflowAfterReviewSet = async (
  trx: Transaction<Database>,
  reviewSetId: string,
  actorId?: string
) => {
  const row = await trx.selectFrom('Common_Review_Set')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Common_Runtime_Item.egcs_cn_runtime')
    .select([
      'Common_Runtime_Item.id as runtimeItemId',
      'Common_Runtime_Item.egcs_cn_state as runtimeState',
      'Common_Runtime.egcs_cn_kind as runtimeKind'
    ])
    .where('Common_Review_Set.id', '=', reviewSetId)
    .where('Common_Review_Set._deleted', '=', false)
    .where('Common_Runtime_Item._deleted', '=', false)
    .executeTakeFirst()
  return row?.runtimeKind === 'workflow' && RUNTIME_TERMINAL_STATES.has(row.runtimeState)
    ? await advanceWorkflowItem(trx, String(row.runtimeItemId), actorId)
    : null
}

export const advanceWorkflowAfterRecommendationSet = async (
  trx: Transaction<Database>,
  recommendationSetId: string,
  actorId?: string
) => {
  const row = await trx.selectFrom('Common_Recommendation_Set')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Recommendation_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Common_Runtime_Item.egcs_cn_runtime')
    .select([
      'Common_Runtime_Item.id as runtimeItemId',
      'Common_Runtime_Item.egcs_cn_state as runtimeState',
      'Common_Runtime.egcs_cn_kind as runtimeKind'
    ])
    .where('Common_Recommendation_Set.id', '=', recommendationSetId)
    .where('Common_Recommendation_Set._deleted', '=', false)
    .where('Common_Runtime_Item._deleted', '=', false)
    .executeTakeFirst()
  return row?.runtimeKind === 'workflow' && RUNTIME_TERMINAL_STATES.has(row.runtimeState)
    ? await advanceWorkflowItem(trx, String(row.runtimeItemId), actorId)
    : null
}

export const advanceApprovalInTransaction = async (
  trx: Transaction<Database>,
  approvalId: string
) => {
  const approval = await trx.selectFrom('Common_Approval')
    .innerJoin('Common_Routing_Slip', 'Common_Routing_Slip.id', 'Common_Approval.egcs_cn_routingslip')
    .innerJoin('Common_Runtime_Item as Routing_Item', 'Routing_Item.id', 'Common_Routing_Slip.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Routing_Item.egcs_cn_runtime')
    .select([
      'Common_Runtime.id as runtimeId',
      'Common_Runtime.egcs_cn_kind as runtimeKind',
      'Common_Runtime.egcs_cn_entitytype as entityType',
      'Common_Runtime.egcs_cn_entityid as entityId',
      'Routing_Item.id as routingItemId',
      'Routing_Item.egcs_cn_parentruntimeitem as parentItemId',
      'Routing_Item.egcs_cn_state as routingState',
      'Common_Approval.egcs_cn_assigneduser as actorId',
      'Common_Approval.egcs_cn_defaultuser as defaultActorId'
    ])
    .where('Common_Approval.id', '=', approvalId)
    .where('Common_Routing_Slip._deleted', '=', false)
    .where('Routing_Item._deleted', '=', false)
    .executeTakeFirst()
  if (!approval || approval.runtimeKind !== 'workflow') return null
  if (isBusinessStatusEntityType(approval.entityType)) {
    await lockBusinessStatus(trx, approval.entityType, String(approval.entityId), 'engine')
  }
  const actorId = String(approval.actorId ?? approval.defaultActorId)
  if (approval.parentItemId === null) {
    return RUNTIME_TERMINAL_STATES.has(approval.routingState)
      ? await advanceWorkflowItem(trx, String(approval.routingItemId), actorId)
      : null
  }
  const parent = await trx.selectFrom('Common_Runtime_Item').select(['id', 'egcs_cn_kind', 'egcs_cn_parentruntimeitem'])
    .where('id', '=', String(approval.parentItemId)).where('_deleted', '=', false).executeTakeFirst()
  if (!parent) return null
  if (parent.egcs_cn_kind === 'recommendation') {
    const recommendation = await trx.selectFrom('Common_Recommendation')
      .select(['id', 'egcs_cn_recommendationset'])
      .where('egcs_cn_runtimeitem', '=', String(parent.id))
      .where('_deleted', '=', false)
      .executeTakeFirst()
    if (!recommendation) return null
    const { advanceRecommendationRuntimeAfterTerminalItem } = await import('./recommendation-runtime')
    await advanceRecommendationRuntimeAfterTerminalItem(trx, String(recommendation.id), actorId)
    return await advanceWorkflowAfterRecommendationSet(trx, String(recommendation.egcs_cn_recommendationset), actorId)
  }
  if (parent.egcs_cn_kind === 'review') {
    const review = await trx.selectFrom('Common_Review').select(['id', 'egcs_cn_reviewset'])
      .where('egcs_cn_runtimeitem', '=', String(parent.id)).where('_deleted', '=', false).executeTakeFirst()
    if (!review) return null
    const { advanceReviewRuntimeAfterTerminalItem } = await import('./review-runtime')
    await advanceReviewRuntimeAfterTerminalItem(trx, String(review.id), actorId)
    return await advanceWorkflowAfterReviewSet(trx, String(review.egcs_cn_reviewset), actorId)
  }
  if (parent.egcs_cn_kind === 'review_set') {
    const set = await trx.selectFrom('Common_Review_Set').select('id')
      .where('egcs_cn_runtimeitem', '=', String(parent.id)).where('_deleted', '=', false).executeTakeFirst()
    return set ? await advanceWorkflowAfterReviewSet(trx, String(set.id), actorId) : null
  }
  return null
}

export const advanceWorkflowAfterApproval = async (
  db: Kysely<Database>,
  approvalId: string
) => await db.transaction().execute(async trx => await advanceApprovalInTransaction(trx, approvalId))

export const advanceWorkflowAfterApprovalForRequest = async (
  event: H3Event,
  approvalId: string,
  execute: (work: (trx: Transaction<Database>) => Promise<unknown>) => Promise<unknown>
    = async work => await event.context.$db.transaction().execute(work)
) => {
  try {
    return await execute(async trx => await advanceApprovalInTransaction(trx, approvalId))
  } catch (error: unknown) {
    if (error instanceof AgreementApprovalSubmissionHashMismatchError) {
      return await badRequest(event, 'AGREEMENT_APPROVAL_SUBMISSION_CHANGED', 'apiErrors.workflow.approval_submission_changed')
    }
    if (error instanceof AgreementApprovalSubmissionPromotionError) {
      return await badRequest(event, 'AGREEMENT_APPROVAL_SUBMISSION_PROMOTION_FAILED', 'apiErrors.workflow.approval_submission_promotion_failed')
    }
    if (error instanceof BusinessStatusViolation) {
      return await throwApiError(event, { statusCode: 409, code: error.code, key: 'apiErrors.request.invalid_status' })
    }
    throw error
  }
}

const getWorkflowRuntimeInSnapshot = async (
  db: Kysely<Database>,
  entityType: Entity_Type,
  entityId: string,
  runtimeId?: string,
  purpose: Workflow_Purpose = 'standard',
  resolvedContext?: ReviewRuntimeEntityContext,
  retryTargetState?: { statusId: StatusId | null, terminal: boolean }
) => {
  const runs = await db.selectFrom('Common_Runtime')
    .innerJoin('Common_Workflow_Run', 'Common_Workflow_Run.id', 'Common_Runtime.id')
    .selectAll('Common_Runtime')
    .select(['Common_Workflow_Run.egcs_cn_completion', 'Common_Workflow_Run.egcs_cn_routing'])
    .where('Common_Runtime.egcs_cn_kind', '=', 'workflow')
    .where('Common_Runtime.egcs_cn_entitytype', '=', entityType)
    .where('Common_Runtime.egcs_cn_entityid', '=', entityId)
    .where('Common_Runtime.egcs_cn_purpose', '=', purpose)
    .where('Common_Runtime._deleted', '=', false)
    .orderBy('Common_Runtime.id', 'desc')
    .execute() as WorkflowRun[]
  if (runs.length === 0) return { current: null, history: [], previous: [], canRetry: false, canCancel: false }
  const activeRun = runs.find(run => ACTIVE_RUNTIME_STATES.includes(run.egcs_cn_state))
  const selected = runtimeId
    ? runs.find(run => String(run.id) === runtimeId)
    : activeRun ?? runs[0]
  if (!selected) return { current: null, history: runs.map(runtimeSummary), previous: [], canRetry: false, canCancel: false }
  const configuration = await readWorkflowRuntimeConfiguration(db, selected)
  const workflowItems = await db.selectFrom('Common_Runtime_Item').selectAll()
    .where('egcs_cn_runtime', '=', String(selected.id))
    .where('_deleted', '=', false)
    .orderBy('egcs_cn_order', 'asc')
    .orderBy('id', 'asc')
    .execute()
  const recommendationRows = await db.selectFrom('Common_Recommendation')
    .innerJoin('Common_Runtime_Item as Recommendation_Item', 'Recommendation_Item.id', 'Common_Recommendation.egcs_cn_runtimeitem')
    .innerJoin('Common_Publication_Version as Schema_Version', 'Schema_Version.id', 'Recommendation_Item.egcs_cn_publicationversion')
    .leftJoin('Common_Runtime_Item as Routing_Item', join => join
      .onRef('Routing_Item.egcs_cn_parentruntimeitem', '=', 'Recommendation_Item.id')
      .on('Routing_Item.egcs_cn_kind', '=', 'routing_slip')
      .on('Routing_Item._deleted', '=', false))
    .leftJoin('Common_Routing_Slip', 'Common_Routing_Slip.egcs_cn_runtimeitem', 'Routing_Item.id')
    .select([
      'Common_Recommendation.id',
      'Common_Recommendation.egcs_cn_outcome',
      'Common_Recommendation.egcs_cn_response',
      'Common_Recommendation.egcs_cn_revision',
      'Common_Recommendation.egcs_cn_resultoptionkey',
      'Common_Recommendation.egcs_cn_recommendationsetup',
      'Recommendation_Item.id as runtimeItemId',
      'Recommendation_Item.egcs_cn_state as runtimeState',
      'Schema_Version.egcs_cn_definition as egcs_cn_definition',
      'Routing_Item.egcs_cn_runtime as approvalRuntimeId',
      'Routing_Item.egcs_cn_state as approvalRuntimeState',
      'Common_Routing_Slip.id as routingSlipId'
    ])
    .where('Recommendation_Item.egcs_cn_runtime', '=', String(selected.id))
    .where('Common_Recommendation._deleted', '=', false)
    .orderBy('Recommendation_Item.egcs_cn_order', 'asc')
    .execute()
  const reviewSets = await db.selectFrom('Common_Review_Set')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
    .selectAll('Common_Review_Set')
    .select([
      'Common_Runtime_Item.id as runtimeItemId',
      'Common_Runtime_Item.egcs_cn_state as runtimeState',
      'Common_Runtime_Item.egcs_cn_order as runtimeOrder'
    ])
    .where('Common_Runtime_Item.egcs_cn_runtime', '=', String(selected.id))
    .where('Common_Review_Set._deleted', '=', false)
    .orderBy('Common_Runtime_Item.egcs_cn_order', 'asc')
    .execute()
  const recommendationSets = await db.selectFrom('Common_Recommendation_Set')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Recommendation_Set.egcs_cn_runtimeitem')
    .selectAll('Common_Recommendation_Set')
    .select([
      'Common_Runtime_Item.id as runtimeItemId',
      'Common_Runtime_Item.egcs_cn_state as runtimeState',
      'Common_Runtime_Item.egcs_cn_order as runtimeOrder'
    ])
    .where('Common_Runtime_Item.egcs_cn_runtime', '=', String(selected.id))
    .where('Common_Recommendation_Set._deleted', '=', false)
    .orderBy('Common_Runtime_Item.egcs_cn_order', 'asc')
    .execute()
  const reviews = await db.selectFrom('Common_Review')
    .innerJoin('Common_Review_Set', 'Common_Review_Set.id', 'Common_Review.egcs_cn_reviewset')
    .innerJoin('Common_Runtime_Item as Review_Item', 'Review_Item.id', 'Common_Review.egcs_cn_runtimeitem')
    .innerJoin('Common_Publication_Version as Schema_Version', 'Schema_Version.id', 'Review_Item.egcs_cn_publicationversion')
    .select([
      'Common_Review.id',
      'Common_Review.egcs_cn_reviewset',
      'Review_Item.id as runtimeItemId',
      'Review_Item.egcs_cn_state as runtimeState',
      'Schema_Version.egcs_cn_definition as schemaDefinition'
    ])
    .where('Review_Item.egcs_cn_runtime', '=', String(selected.id))
    .where('Common_Review._deleted', '=', false)
    .orderBy('Review_Item.egcs_cn_order', 'asc')
    .execute()
  const sourceApprovalStage = await db.selectFrom('Common_Routing_Slip')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Routing_Slip.egcs_cn_runtimeitem')
    .select([
      'Common_Routing_Slip.id as routingSlipId',
      'Common_Runtime_Item.id as runtimeItemId',
      'Common_Runtime_Item.egcs_cn_state as runtimeState',
      'Common_Runtime_Item.egcs_cn_order as order'
    ])
    .where('Common_Runtime_Item.egcs_cn_runtime', '=', String(selected.id))
    .where('Common_Runtime_Item.egcs_cn_parentruntimeitem', 'is', null)
    .where('Common_Routing_Slip._deleted', '=', false)
    .orderBy('Common_Runtime_Item.egcs_cn_order', 'desc')
    .executeTakeFirst()
  const nestedApprovalStages = await db.selectFrom('Common_Routing_Slip')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Routing_Slip.egcs_cn_runtimeitem')
    .select([
      'Common_Routing_Slip.id as routingSlipId',
      'Common_Runtime_Item.id as runtimeItemId',
      'Common_Runtime_Item.egcs_cn_parentruntimeitem as parentRuntimeItemId',
      'Common_Runtime_Item.egcs_cn_state as runtimeState',
      'Common_Runtime_Item.egcs_cn_order as order'
    ])
    .where('Common_Runtime_Item.egcs_cn_runtime', '=', String(selected.id))
    .where('Common_Runtime_Item.egcs_cn_parentruntimeitem', 'is not', null)
    .where('Common_Routing_Slip._deleted', '=', false)
    .orderBy('Common_Runtime_Item.egcs_cn_order', 'asc')
    .execute()
  const submission = purpose === 'approval_submission'
    ? await db.selectFrom('Funding_Case_Agreement_Approval_Submission').selectAll()
        .where('egcs_fc_workflowrun', '=', String(selected.id)).executeTakeFirst()
    : null
  const transitions = await db.selectFrom('Common_Workflow_Status_Transition').selectAll()
    .where('egcs_cn_workflowrun', '=', String(selected.id)).orderBy('id', 'asc').execute()
  const runtimeTransitions = await db.selectFrom('Common_Runtime_Transition').selectAll()
    .where('egcs_cn_runtime', '=', String(selected.id)).orderBy('id', 'asc').execute()
  const ownerBlockers = await db.selectFrom('Common_Workflow_Owner_Blocker').selectAll()
    .where('egcs_cn_workflowrun', '=', String(selected.id))
    .where('_deleted', '=', false)
    .orderBy('id', 'asc')
    .execute()
  const topLevelItems = workflowItems.filter(item => item.egcs_cn_parentruntimeitem === null)
  const routing = selected.egcs_cn_routing as WorkflowRoutingEvidence | null
  const sourceVersion = routing
    ? await db.selectFrom('Common_Publication_Version').select('egcs_cn_definition')
        .where('id', '=', String(selected.egcs_cn_sourcepublicationversion)).executeTakeFirstOrThrow()
    : null
  const allMembers = sourceVersion ? readPublishedWorkflowConfiguration(sourceVersion.egcs_cn_definition).members : configuration.members
  const steps = allMembers.map(member => ({
    eligibility: routing?.decisions.find(decision => decision.memberId === member.memberId) ?? { memberId: member.memberId, eligible: true, unmatchedFieldIds: [] },
    ...member,
    runtimeItem: topLevelItems.find(item => item.egcs_cn_order === member.sequence)
      ? runtimeItemSummary(topLevelItems.find(item => item.egcs_cn_order === member.sequence)!)
      : null,
    approvalStage: nestedApprovalStages.find(stage => stage.parentRuntimeItemId
      === topLevelItems.find(item => item.egcs_cn_order === member.sequence)?.id) ?? null
  }))
  const retryContext = !runtimeId && !activeRun && RETRYABLE_RUNTIME_STATES.includes(selected.egcs_cn_state)
    ? resolvedContext ?? await resolveReviewRuntimeEntityFromEntity(db, entityType, entityId)
    : null
  const retrySetup = retryContext
    ? await resolveRetryableWorkflowSetup(db, retryContext, String(selected.id), false, purpose)
    : null
  const current = runtimeSummary(selected)
  return {
    current,
    workflowItems: workflowItems.map(runtimeItemSummary),
    recommendations: recommendationRows.map(recommendation => ({
      ...recommendation,
      egcs_cn_definition: readPublishedRecommendationSchema(recommendation.egcs_cn_definition).definition
    })),
    recommendationSet: recommendationSets[0] ?? null,
    recommendationSets,
    reviewSet: reviewSets[0] ?? null,
    reviewSets,
    reviews: reviews.map(review => {
      const definition = review.schemaDefinition as unknown as {
        reviewType: 'assessment' | 'checklist'
        name: { en: string, fr: string }
      }
      return {
        ...review,
        egcs_cn_reviewtype: definition.reviewType,
        egcs_cn_name_en: definition.name.en,
        egcs_cn_name_fr: definition.name.fr,
        workflowMemberOrder: reviewSets.find(set => String(set.id) === String(review.egcs_cn_reviewset))?.runtimeOrder
      }
    }),
    sourceApprovalStage: sourceApprovalStage ?? null,
    history: runs.map(runtimeSummary),
    previous: projectPreviousWorkflowRuns(runs),
    canRetry: isWorkflowRetryStatusEligible(retrySetup, retryTargetState),
    canCancel: Boolean(activeRun && String(activeRun.id) === String(selected.id)),
    submission: submission ?? null,
    steps,
    routing,
    transitions,
    runtimeTransitions,
    ownerBlockers,
    plan: {
      review: configuration.members.find(member => member.reviewPlan)?.reviewPlan
        ? {
            name_en: configuration.members.find(member => member.reviewPlan)!.reviewPlan!.name.en,
            name_fr: configuration.members.find(member => member.reviewPlan)!.reviewPlan!.name.fr
          }
        : null,
      recommendations: configuration.members.flatMap(member => member.recommendationPlan?.members ?? []).map(member => ({
        ordinal: member.order,
        setup_id: member.memberId,
        name_en: member.schemaNameEn,
        name_fr: member.schemaNameFr,
        has_approval: Boolean(member.approval),
        fails_set_on_not_recommended: member.failOnNotRecommended
      })),
      has_final_approval: configuration.members.some(member => member.kind === 'approval_template')
    }
  }
}

/**
 * Reads a complete workflow runtime projection from one consistent database snapshot.
 *
 * @param db Database connection.
 * @param entityType Runtime entity type.
 * @param entityId Runtime entity identifier.
 * @param runtimeId Optional historical runtime identifier.
 * @param purpose Workflow purpose.
 * @param resolvedContext Optional pre-resolved entity context.
 * @param retryTargetState Optional retry target state.
 * @param retryTargetState.statusId Target status identity.
 * @param retryTargetState.terminal Whether the target status is terminal.
 * @returns Consistent runtime projection.
 */
export const getWorkflowRuntime = async (
  db: Kysely<Database>,
  entityType: Entity_Type,
  entityId: string,
  runtimeId?: string,
  purpose: Workflow_Purpose = 'standard',
  resolvedContext?: ReviewRuntimeEntityContext,
  retryTargetState?: { statusId: StatusId | null, terminal: boolean }
) => await db.transaction()
  .setIsolationLevel('repeatable read')
  .setAccessMode('read only')
  .execute(async trx => await getWorkflowRuntimeInSnapshot(
    trx as unknown as Kysely<Database>,
    entityType,
    entityId,
    runtimeId,
    purpose,
    resolvedContext,
    retryTargetState
  ))
