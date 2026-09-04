/* eslint-disable jsdoc/require-jsdoc -- Completion helpers expose typed contracts covered by focused runtime tests. */
import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import type { CompletionHookPayload } from '~~/shared/types/completion'
import type { Database } from '~~/shared/types/database'
import type { RuntimeState } from '~~/shared/constants/system-lifecycle'
import type {
  CommonReviewCompletionPayloadInput,
  CompletionExecuteInput
} from '~~/shared/types/schemas/completion'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { parseI18n } from '~~/server/utils/api-validate'
import {
  countPendingReviewAdditionalReviewers,
  resolveCurrentCommonUser
} from '~~/server/utils/additional-reviewer-runtime'
import {
  createCompletionRecord,
  emitCompletionHook,
  resolveCompletionEvidenceId,
  resolveCompletionRecord
} from '~~/server/utils/completion-runtime-core'
import { assertReviewNotLocked, isReviewLockedStatus } from '~~/server/utils/review-runtime-state'
import {
  executeFreshAuthorizedReviewRuntimeWrite,
  resolveReviewRuntimeEntityFromReview,
  type ReviewRuntimeEntityContext
} from '~~/server/utils/review-runtime-access'
import {
  getAssessmentMutationReview,
  persistPreparedAssessment,
  prepareAssessmentPersistence
} from '~~/server/utils/assessment-runtime-persistence'
import {
  getChecklistMutationReview,
  persistPreparedChecklist,
  prepareChecklistPersistence
} from '~~/server/utils/checklist-runtime-persistence'
import { materializeCanonicalApprovalRuntime } from '~~/server/utils/canonical-approval-runtime'
import { activateRetriedApprovalRuntime, advanceReviewRuntimeAfterTerminalItem } from '~~/server/utils/review-runtime'
import { readPublishedReviewSetup } from '~~/server/utils/review-setup-versioning'
import { readPublishedReviewSchema } from '~~/server/utils/review-schema-versioning'
import { transitionRuntimeItem } from '~~/server/utils/system-runtime'
import { CommonReviewCompletionPayloadSchema } from '~~/shared/types/schemas/completion'

export type CommonReviewCompletionContext = {
  entityType: 'commonreview'
  entityId: string
  reviewId: string
  reviewSetId: string | null
  runtimeId: string
  runtimeItemId: string
  reviewStatus: RuntimeState
  reviewSetStatus: RuntimeState
  reviewType: Database['Common_Review_Schema']['egcs_cn_reviewtype']
  runtimeEntity: ReviewRuntimeEntityContext
}

export const resolveReviewCompletionTerminalState = (input: {
  reviewType: Database['Common_Review_Schema']['egcs_cn_reviewtype']
  failOnChecklistFailure?: boolean
  checklistResult?: Database['Common_Checklist']['egcs_cn_result']
  failureThreshold?: number | string | null
  reviewResult?: number | string | null
}): 'succeeded' | 'unsuccessful' => {
  if (input.reviewType === 'checklist') {
    return input.failOnChecklistFailure === true && input.checklistResult === 'fail'
      ? 'unsuccessful'
      : 'succeeded'
  }
  return input.failureThreshold !== undefined
    && input.failureThreshold !== null
    && input.reviewResult !== undefined
    && input.reviewResult !== null
    && Number(input.reviewResult) < Number(input.failureThreshold)
    ? 'unsuccessful'
    : 'succeeded'
}

/**
 * Resolves runtime completion execution against the review row while authorizing through the
 * business entity that owns it.
 *
 * @param db - Database connection.
 * @param reviewId - Runtime review identifier.
 * @returns Resolved context when the review exists and its owner can be resolved.
 */
export const resolveCommonReviewCompletionContext = async (
  db: H3Event['context']['$db'],
  reviewId: string
): Promise<CommonReviewCompletionContext | null> => {
  const runtimeEntity = await resolveReviewRuntimeEntityFromReview(db, reviewId)

  if (!runtimeEntity) {
    return null
  }

  const review = await db
    .selectFrom('Common_Review')
    .innerJoin('Common_Review_Set', 'Common_Review_Set.id', 'Common_Review.egcs_cn_reviewset')
    .innerJoin('Common_Runtime_Item as Review_Item', 'Review_Item.id', 'Common_Review.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime_Item as Review_Set_Item', 'Review_Set_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review.egcs_cn_reviewschema')
    .select([
      'Common_Review.id as id',
      'Review_Item.egcs_cn_runtime as runtimeId',
      'Review_Item.id as runtimeItemId',
      'Review_Item.egcs_cn_state as runtimeState',
      'Common_Review.egcs_cn_reviewset as egcs_cn_reviewset',
      'Review_Set_Item.egcs_cn_state as reviewSetRuntimeState',
      'Common_Review_Schema.egcs_cn_reviewtype as egcs_cn_reviewtype'
    ])
    .where('Common_Review.id', '=', reviewId)
    .where('Common_Review._deleted', '=', false)
    .where('Common_Review_Set._deleted', '=', false)
    .executeTakeFirst()

  if (!review) {
    return null
  }

  return {
    entityType: 'commonreview',
    entityId: reviewId,
    reviewId,
    reviewSetId: review.egcs_cn_reviewset ? String(review.egcs_cn_reviewset) : null,
    runtimeId: String(review.runtimeId),
    runtimeItemId: String(review.runtimeItemId),
    reviewStatus: review.runtimeState,
    reviewSetStatus: review.reviewSetRuntimeState,
    reviewType: review.egcs_cn_reviewtype,
    runtimeEntity
  }
}

const parseCommonReviewCompletionPayload = async (
  event: H3Event,
  input: CompletionExecuteInput
): Promise<CommonReviewCompletionPayloadInput> => await parseI18n(
  event,
  CommonReviewCompletionPayloadSchema,
  input.payload
)

const applyCommonReviewCompletionSideEffects = async (
  trx: Transaction<Database>,
  reviewId: string,
  actor: string,
  terminalState: 'succeeded' | 'unsuccessful'
): Promise<void> => {
  const context = await trx.selectFrom('Common_Review')
    .innerJoin('Common_Review_Set', 'Common_Review_Set.id', 'Common_Review.egcs_cn_reviewset')
    .innerJoin('Common_Runtime_Item as Review_Item', 'Review_Item.id', 'Common_Review.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime_Item as Set_Item', 'Set_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Publication_Version as Set_Version', 'Set_Version.id', 'Set_Item.egcs_cn_publicationversion')
    .innerJoin('Common_Publication_Version as Schema_Version', 'Schema_Version.id', 'Review_Item.egcs_cn_publicationversion')
    .select([
      'Review_Item.id as runtimeItemId',
      'Review_Item.egcs_cn_runtime as runtimeId',
      'Review_Item.egcs_cn_order as reviewOrder',
      'Review_Item.egcs_cn_state as runtimeState',
      'Set_Version.egcs_cn_definition as setDefinition',
      'Schema_Version.egcs_cn_definition as schemaDefinition'
    ])
    .where('Common_Review.id', '=', reviewId)
    .where('Common_Review._deleted', '=', false)
    .forUpdate(['Common_Review', 'Review_Item'])
    .executeTakeFirst()
  if (!context) throw new Error('Review completion runtime context disappeared during the locked transaction')
  if (context.runtimeState !== 'active') return
  const setup = readPublishedReviewSetup(context.setDefinition)
  const schema = readPublishedReviewSchema(context.schemaDefinition)
  if (!schema) throw new Error('Review completion has an invalid pinned schema definition')
  const approval = setup.members.find(member => member.order === context.reviewOrder)?.approval
  if (approval) {
    if (await activateRetriedApprovalRuntime(trx, String(context.runtimeItemId), actor)) return
    await materializeCanonicalApprovalRuntime(trx, {
      entityType: 'commonreview',
      entityId: reviewId,
      nameEn: schema.name.en,
      nameFr: schema.name.fr,
      approvalTemplateId: approval.publicationId,
      approvalTemplateVersionId: approval.publicationVersionId,
      actorId: actor,
      parentRuntimeItemId: String(context.runtimeItemId),
      purpose: 'standard'
    })
    return
  }
  await transitionRuntimeItem(trx, {
    runtimeId: String(context.runtimeId),
    runtimeItemId: String(context.runtimeItemId),
    from: 'active',
    to: terminalState,
    actorId: actor,
    reason: 'review_completed'
  })
  const aggregation = await advanceReviewRuntimeAfterTerminalItem(trx, reviewId, actor)
  if (aggregation && 'kind' in aggregation && aggregation.kind === 'final_approval_required') {
    if (await activateRetriedApprovalRuntime(trx, aggregation.reviewSetRuntimeItemId, actor)) return
    await materializeCanonicalApprovalRuntime(trx, {
      entityType: aggregation.entityType,
      entityId: aggregation.entityId,
      nameEn: aggregation.nameEn,
      nameFr: aggregation.nameFr,
      approvalTemplateId: aggregation.approval.publicationId,
      approvalTemplateVersionId: aggregation.approval.publicationVersionId,
      actorId: actor,
      parentRuntimeItemId: aggregation.reviewSetRuntimeItemId,
      purpose: 'standard'
    })
  }
}

/**
 * Returns the generic runtime completion state for a review-backed executable entity.
 *
 * @param event - Active request event.
 * @param reviewId - Runtime review identifier.
 * @returns Completion runtime payload or null when the review does not exist.
 */
export const getCommonReviewCompletionRuntime = async (
  event: H3Event,
  reviewId: string
): Promise<{
  item: Awaited<ReturnType<typeof resolveCompletionRecord>>
  can_complete: boolean
  blocker: 'business_status' | null
} | null> => {
  const context = await resolveCommonReviewCompletionContext(event.context.$db, reviewId)
  if (!context) {
    return null
  }

  const item = await resolveCompletionRecord(event.context.$db, 'commonreview', reviewId)

  return {
    item,
    can_complete: item === null && !isReviewLockedStatus(context.reviewStatus, context.reviewSetStatus),
    blocker: item ? null : isReviewLockedStatus(context.reviewStatus, context.reviewSetStatus) ? 'business_status' as const : null
  }
}

/**
 * Executes runtime completion for a review-backed assessment.
 *
 * @param event - Active request event.
 * @param input - Generic completion input to be parsed by the commonreview adapter.
 * @returns Completion runtime payload or null when the review does not exist.
 */
export const executeCommonReviewCompletion = async (
  event: H3Event,
  input: CompletionExecuteInput
): Promise<{ item: Awaited<ReturnType<typeof resolveCompletionRecord>>, can_complete: boolean } | null> => {
  const db = event.context.$db
  const reviewId = input.entityId
  const context = await resolveCommonReviewCompletionContext(db, reviewId)

  if (!context) {
    return null
  }

  const body = await parseCommonReviewCompletionPayload(event, input)
  const comments = input.comments ?? ''
  const result = await executeFreshAuthorizedReviewRuntimeWrite(event, context.runtimeEntity, async trx => {
    const lockedContext = await resolveCommonReviewCompletionContext(trx, reviewId)
    if (!lockedContext) {
      return await notFound(event, 'ASSESSMENT_NOT_FOUND', 'apiErrors.admin_common.not_found')
    }
    await assertReviewNotLocked(event, lockedContext.reviewStatus, lockedContext.reviewSetStatus)

    const existingCompletion = await resolveCompletionEvidenceId(trx, 'commonreview', reviewId)
    if (existingCompletion) {
      return await badRequest(event, 'REVIEW_ALREADY_COMPLETED', 'apiErrors.request.review_locked')
    }

    const pendingAdditionalReviewers = await countPendingReviewAdditionalReviewers(trx, reviewId)
    if (pendingAdditionalReviewers > 0) {
      return await badRequest(event, 'PENDING_ADDITIONAL_REVIEWERS', 'apiErrors.request.pending_additional_reviewers')
    }

    const currentCommonUser = await resolveCurrentCommonUser(event, trx)
    if (!currentCommonUser) {
      return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    }

    let terminalState: 'succeeded' | 'unsuccessful' = 'succeeded'
    if (lockedContext.reviewType === 'checklist') {
      const checklist = await getChecklistMutationReview(trx, reviewId)
      if (!checklist) {
        return await notFound(event, 'CHECKLIST_NOT_FOUND', 'apiErrors.admin_common.not_found')
      }
      if (!('checklistResponse' in body)) {
        return await badRequest(event, 'CHECKLIST_RESPONSE_REQUIRED', 'apiErrors.request.validation_failed')
      }
      const prepared = await prepareChecklistPersistence(event, checklist, body.checklistResponse, {
        enforceCompletion: true
      })
      await persistPreparedChecklist(trx, checklist, prepared)
      terminalState = resolveReviewCompletionTerminalState({
        reviewType: 'checklist',
        failOnChecklistFailure: checklist.egcs_cn_failonchecklistfailure,
        checklistResult: prepared.evaluation.result
      })
    } else {
      const assessment = await getAssessmentMutationReview(trx, reviewId)
      if (!assessment || !('assessmentResponse' in body)) {
        return await notFound(event, 'ASSESSMENT_NOT_FOUND', 'apiErrors.admin_common.not_found')
      }
      const prepared = await prepareAssessmentPersistence(event, assessment, body.assessmentResponse, {
        enforceCompletion: true
      })
      await persistPreparedAssessment(trx, assessment, prepared)
      terminalState = resolveReviewCompletionTerminalState({
        reviewType: 'assessment',
        failureThreshold: assessment.egcs_cn_failurethreshold,
        reviewResult: prepared.reviewResult
      })
    }

    const createdCompletion = await createCompletionRecord(trx, {
      entityType: 'commonreview',
      entityId: reviewId,
      comments,
      userId: currentCommonUser.id,
      disposition: 'not_applicable'
    })

    const completionHookPayload: CompletionHookPayload = {
      completionId: createdCompletion.id,
      entityType: 'commonreview',
      entityId: reviewId,
      completedByUserId: currentCommonUser.id,
      completedAt: createdCompletion.completedAt,
      comments,
      context: {
        reviewId,
        reviewSetId: lockedContext.reviewSetId,
        parentEntityType: lockedContext.runtimeEntity.entityType,
        parentEntityId: lockedContext.runtimeEntity.entityId
      }
    }

    await applyCommonReviewCompletionSideEffects(trx, reviewId, currentCommonUser.id, terminalState)

    return { hookPayload: completionHookPayload, currentCommonUser }
  })

  if (!result || typeof result !== 'object' || !('hookPayload' in result)) {
    return result
  }

  const { hookPayload, currentCommonUser } = result

  await emitCompletionHook(hookPayload)

  return {
    item: {
      id: hookPayload.completionId,
      egcs_cn_comments: hookPayload.comments,
      egcs_cn_user: hookPayload.completedByUserId,
      egcs_cn_user_name: currentCommonUser.name,
      egcs_cn_completedat: hookPayload.completedAt,
      egcs_cn_disposition: 'not_applicable'
    },
    can_complete: false
  }
}
