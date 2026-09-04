import { badRequest, notFound } from '~~/server/utils/api-errors'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { AssessmentResponseSchema } from '~~/shared/types/schemas/assessment/assessmentresponse'
import {
  authorizeReviewRuntimeAction,
  executeFreshAuthorizedReviewRuntimeWrite,
  resolveReviewRuntimeEntityFromReview
} from '~~/server/utils/review-runtime-access'
import { assertReviewNotLocked } from '~~/server/utils/review-runtime-state'
import {
  getAssessmentMutationReview,
  persistPreparedAssessment,
  prepareAssessmentPersistence
} from '~~/server/utils/assessment-runtime-persistence'
import type { PublishedReviewSchemaDefinition } from '~~/server/utils/review-schema-versioning'
import { requireAuthContext } from '~~/server/utils/authorize'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const reviewId = getRouterParam(event, 'reviewId')

  if (!reviewId) {
    return await badRequest(event, 'MISSING_REVIEW_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(reviewId)) {
    return await notFound(event, 'ASSESSMENT_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  const review = await getAssessmentMutationReview(db, reviewId)

  if (!review) {
    return await notFound(event, 'ASSESSMENT_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  // Assessment save stays generic at the route layer, but update permission is still evaluated
  // against the owning entity so future review target entities can plug in without another URL shape.
  const runtimeEntity = await resolveReviewRuntimeEntityFromReview(db, reviewId)
  if (!runtimeEntity) {
    return await notFound(event, 'ASSESSMENT_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  await authorizeReviewRuntimeAction(event, 'save_assessment', runtimeEntity)
  await assertReviewNotLocked(event, review.runtimeState, review.reviewSetRuntimeState)
  const body = await readValidatedBodyI18n(event, AssessmentResponseSchema)
  const { currentReview, persistedCustomOutcomes, prepared } = await executeFreshAuthorizedReviewRuntimeWrite(
    event,
    runtimeEntity,
    async trx => {
      const lockedReview = await getAssessmentMutationReview(trx, reviewId)
      if (!lockedReview) {
        return await notFound(event, 'ASSESSMENT_NOT_FOUND', 'apiErrors.admin_common.not_found')
      }
      await assertReviewNotLocked(event, lockedReview.runtimeState, lockedReview.reviewSetRuntimeState)
      const lockedPrepared = await prepareAssessmentPersistence(event, lockedReview, body, {
        enforceCompletion: false
      })
      const customOutcomes = await persistPreparedAssessment(trx, lockedReview, lockedPrepared)
      return {
        currentReview: lockedReview,
        persistedCustomOutcomes: customOutcomes,
        prepared: lockedPrepared
      }
    }
  )

  const publishedSchema = currentReview.egcs_cn_definition as unknown as PublishedReviewSchemaDefinition
  return {
    id: String(currentReview.id),
    runtimeId: String(currentReview.runtimeId),
    runtimeItemId: String(currentReview.runtimeItemId),
    runtimeState: currentReview.runtimeState,
    attempt: Number(currentReview.attempt),
    previousRuntimeId: currentReview.previousRuntimeId === null ? null : String(currentReview.previousRuntimeId),
    egcs_cn_reviewset: String(currentReview.egcs_cn_reviewset),
    egcs_cn_reviewschema: String(currentReview.egcs_cn_reviewschema),
    egcs_cn_helpers: currentReview.egcs_cn_helpers,
    egcs_cn_disablecustomoutcomes: currentReview.egcs_cn_disablecustomoutcomes,
    egcs_cn_disablealignment: currentReview.egcs_cn_disablealignment,
    egcs_cn_disablereviewers: currentReview.egcs_cn_disablereviewers,
    egcs_cn_reviewalignment: prepared.normalizedReviewAlignment,
    egcs_cn_reviewalignresult: prepared.normalizedReviewAlignmentResult,
    egcs_cn_reviewalignmentnarrative: prepared.normalizedReviewAlignmentNarrative ?? '',
    egcs_cn_entitytype: currentReview.egcs_cn_entitytype,
    egcs_cn_entityid: String(currentReview.egcs_cn_entityid),
    egcs_cn_agency: publishedSchema.agencyId,
    egcs_cn_name_en: publishedSchema.name.en,
    egcs_cn_name_fr: publishedSchema.name.fr,
    egcs_cn_outcomename_en: publishedSchema.outcomeName.en,
    egcs_cn_outcomename_fr: publishedSchema.outcomeName.fr,
    publicationVersionId: String(currentReview.publicationVersionId),
    publicationVersion: Number(currentReview.egcs_cn_version),
    egcs_cn_scoringmatrix: prepared.runtimeSchema.scoringMatrix,
    egcs_cn_assessmentschema: {
      helpers: prepared.runtimeSchema.helpers,
      sections: prepared.runtimeSchema.sections,
      sectionMatrix: prepared.runtimeSchema.sectionMatrix,
      outcomes: prepared.runtimeSchema.outcomes,
      impactors: prepared.runtimeSchema.impactors
    },
    egcs_cn_reviewresult: prepared.reviewResult,
    assessmentResponse: {
      ...prepared.normalizedAssessmentResponse,
      egcs_cn_reviewalignment: prepared.normalizedReviewAlignment,
      egcs_cn_reviewalignresult: prepared.normalizedReviewAlignmentResult,
      egcs_cn_reviewalignmentnarrative: prepared.normalizedReviewAlignmentNarrative ?? '',
      customOutcomes: persistedCustomOutcomes
    },
    runtime: prepared.runtime
  }
})
