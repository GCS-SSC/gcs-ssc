import { badRequest, notFound } from '~~/server/utils/api-errors'
import {
  getChecklistDefinition,
  getChecklistMutationReview,
  loadChecklistResponses
} from '~~/server/utils/checklist-runtime-persistence'
import {
  authorizeReviewRuntimeAction,
  canAuthorizeReviewRuntimeAction,
  resolveReviewRuntimeEntityFromReview
} from '~~/server/utils/review-runtime-access'
import { isReviewLockedStatus } from '~~/server/utils/review-runtime-state'
import {
  countPendingReviewAdditionalReviewers,
  countReviewAdditionalReviewers
} from '~~/server/utils/additional-reviewer-runtime'
import { requireAuthContext } from '~~/server/utils/authorize'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const reviewId = getRouterParam(event, 'reviewId')
  if (!reviewId) return await badRequest(event, 'MISSING_REVIEW_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(reviewId)) {
    return await notFound(event, 'CHECKLIST_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  const [review, runtimeEntity] = await Promise.all([
    getChecklistMutationReview(db, reviewId),
    resolveReviewRuntimeEntityFromReview(db, reviewId)
  ])
  if (!review || !runtimeEntity) {
    return await notFound(event, 'CHECKLIST_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  await authorizeReviewRuntimeAction(event, 'read_assessment', runtimeEntity)

  const entityNamesPromise = runtimeEntity.entityType === 'applicantrecipient'
    ? db.selectFrom('Applicant_Recipient_Profile').select([
        'egcs_ar_legalname_en as entity_name_en',
        'egcs_ar_legalname_fr as entity_name_fr',
        'egcs_ar_operatingname_en as entity_operating_name_en',
        'egcs_ar_operatingname_fr as entity_operating_name_fr'
      ]).where('id', '=', runtimeEntity.entityId).where('_deleted', '=', false).executeTakeFirst()
    : Promise.resolve(undefined)
  const [definition, responses, details, schema, entityNames, additionalReviewerCount, pendingAdditionalReviewerCount] = await Promise.all([
    getChecklistDefinition(event, review),
    loadChecklistResponses(db, String(review.checklistId)),
    db.selectFrom('Common_Checklist').select(['egcs_cn_result', 'egcs_cn_evaluationtrace'])
      .where('id', '=', String(review.checklistId)).executeTakeFirstOrThrow(),
    Promise.resolve(review.egcs_cn_definition as Record<string, unknown>),
    entityNamesPromise,
    countReviewAdditionalReviewers(db, String(review.id)),
    countPendingReviewAdditionalReviewers(db, String(review.id))
  ])
  const isLocked = isReviewLockedStatus(review.runtimeState, review.reviewSetRuntimeState)
  const canUpdate = !isLocked && await canAuthorizeReviewRuntimeAction(event, 'save_assessment', runtimeEntity)

  return {
    id: String(review.id),
    runtimeId: String(review.runtimeId),
    runtimeItemId: String(review.runtimeItemId),
    runtimeState: review.runtimeState,
    attempt: Number(review.attempt),
    previousRuntimeId: review.previousRuntimeId === null ? null : String(review.previousRuntimeId),
    egcs_cn_reviewset: String(review.egcs_cn_reviewset),
    egcs_cn_reviewschema: String(review.egcs_cn_reviewschema),
    egcs_cn_entitytype: runtimeEntity.entityType,
    egcs_cn_entityid: runtimeEntity.entityId,
    egcs_cn_name_en: (schema.name as { en: string }).en,
    egcs_cn_name_fr: (schema.name as { fr: string }).fr,
    publicationVersionId: String(review.publicationVersionId),
    publicationVersion: Number(review.egcs_cn_pinnedversion),
    egcs_cn_disablereviewers: review.egcs_cn_disablereviewers,
    entity_name_en: entityNames?.entity_name_en ?? '',
    entity_name_fr: entityNames?.entity_name_fr ?? '',
    entity_operating_name_en: entityNames?.entity_operating_name_en ?? '',
    entity_operating_name_fr: entityNames?.entity_operating_name_fr ?? '',
    checklistDefinition: definition,
    checklistResponse: {
      responses,
      result: details.egcs_cn_result,
      evaluationTrace: details.egcs_cn_evaluationtrace
    },
    permissions: { can_read: true, can_update: canUpdate },
    reviewRuntime: {
      is_locked: isLocked,
      additional_reviewer_count: additionalReviewerCount,
      pending_additional_reviewer_count: pendingAdditionalReviewerCount
    }
  }
})
