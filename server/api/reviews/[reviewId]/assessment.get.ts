import { badRequest, notFound, throwApiError } from '~~/server/utils/api-errors'
import type { PublishedReviewSchemaDefinition, ReviewSchemaContentSource } from '~~/server/utils/review-schema-versioning'
import {
  InvalidPersistedAssessmentDefinitionError,
  normalizeAssessmentRuntimeSchema
} from '~~/server/utils/assessment-runtime-schema'
import type { AssessmentRuntimeSchema } from '~~/server/utils/assessment-runtime-schema'
import { buildAssessmentRuntimeSummary } from '~~/shared/utils/assessment'
import {
  countPendingReviewAdditionalReviewers,
  countReviewAdditionalReviewers
} from '~~/server/utils/additional-reviewer-runtime'
import {
  authorizeReviewRuntimeAction,
  canAuthorizeReviewRuntimeAction,
  resolveReviewRuntimeEntityFromReview
} from '~~/server/utils/review-runtime-access'
import { isReviewLockedStatus } from '~~/server/utils/review-runtime-state'
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

  const review = await db
    .selectFrom('Common_Review')
    .innerJoin('Common_Review_Set', 'Common_Review_Set.id', 'Common_Review.egcs_cn_reviewset')
    .innerJoin('Common_Runtime_Item as Review_Item', 'Review_Item.id', 'Common_Review.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime_Item as Review_Set_Item', 'Review_Set_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Review_Item.egcs_cn_runtime')
    .innerJoin('Common_Review_Set_Setup', 'Common_Review_Set_Setup.id', 'Common_Review_Set.egcs_cn_reviewsetsetup')
    .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review.egcs_cn_reviewschema')
    .innerJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Review_Item.egcs_cn_publicationversion')
    .leftJoin('Applicant_Recipient_Profile', join => join
      .onRef('Applicant_Recipient_Profile.id', '=', 'Common_Review_Set.egcs_cn_entityid')
      .on('Common_Review_Set.egcs_cn_entitytype', '=', 'applicantrecipient'))
    .select([
      'Common_Review.id as id',
      'Common_Runtime.id as runtimeId',
      'Common_Runtime.egcs_cn_attempt as attempt',
      'Common_Runtime.egcs_cn_previousruntime as previousRuntimeId',
      'Review_Item.id as runtimeItemId',
      'Review_Item.egcs_cn_state as runtimeState',
      'Common_Review.egcs_cn_reviewresult as egcs_cn_reviewresult',
      'Common_Review.egcs_cn_reviewset as egcs_cn_reviewset',
      'Review_Set_Item.egcs_cn_state as reviewSetRuntimeState',
      'Common_Review.egcs_cn_reviewschema as egcs_cn_reviewschema',
      'Common_Publication_Version.id as publicationVersionId',
      'Common_Publication_Version.egcs_cn_version as egcs_cn_pinnedversion',
      'Common_Publication_Version.egcs_cn_definition as egcs_cn_definition',
      'Common_Review.egcs_cn_helpers as egcs_cn_helpers',
      'Common_Review.egcs_cn_disablecustomoutcomes as egcs_cn_disablecustomoutcomes',
      'Common_Review.egcs_cn_disablealignment as egcs_cn_disablealignment',
      'Common_Review.egcs_cn_disablereviewers as egcs_cn_disablereviewers',
      'Common_Review.egcs_cn_reviewalignment as egcs_cn_reviewalignment',
      'Common_Review.egcs_cn_reviewalignresult as egcs_cn_reviewalignresult',
      'Common_Review.egcs_cn_reviewalignmentnarrative as egcs_cn_reviewalignmentnarrative',
      'Common_Review_Set.egcs_cn_entitytype as egcs_cn_entitytype',
      'Common_Review_Set.egcs_cn_entityid as egcs_cn_entityid',
      'Common_Review_Set_Setup.egcs_cn_scopetype as egcs_cn_scopetype',
      'Common_Review_Set_Setup.egcs_cn_scopeid as egcs_cn_scopeid',
      'Common_Review_Schema.egcs_cn_agency as egcs_cn_agency',
      'Common_Review_Schema.egcs_cn_name_en as egcs_cn_name_en',
      'Common_Review_Schema.egcs_cn_name_fr as egcs_cn_name_fr',
      'Common_Review_Schema.egcs_cn_outcomename_en as egcs_cn_outcomename_en',
      'Common_Review_Schema.egcs_cn_outcomename_fr as egcs_cn_outcomename_fr',
      'Applicant_Recipient_Profile.egcs_ar_legalname_en as entity_name_en',
      'Applicant_Recipient_Profile.egcs_ar_legalname_fr as entity_name_fr',
      'Applicant_Recipient_Profile.egcs_ar_operatingname_en as entity_operating_name_en',
      'Applicant_Recipient_Profile.egcs_ar_operatingname_fr as entity_operating_name_fr'
    ])
    .where('Common_Review.id', '=', reviewId)
    .where('Common_Review._deleted', '=', false)
    .where('Common_Review_Set._deleted', '=', false)
    .where('Common_Review_Schema.egcs_cn_reviewtype', '=', 'assessment')
    .executeTakeFirst()

  if (!review) {
    return await notFound(event, 'ASSESSMENT_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  // Assessment is a generic review child resource. It authorizes through the attached entity,
  // while breadcrumbs and navigation continue to be handled by the page using the payload below.
  const runtimeEntity = await resolveReviewRuntimeEntityFromReview(db, reviewId)
  if (!runtimeEntity) {
    return await notFound(event, 'ASSESSMENT_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  await authorizeReviewRuntimeAction(event, 'read_assessment', runtimeEntity)
  const isLocked = isReviewLockedStatus(review.runtimeState, review.reviewSetRuntimeState)
  const canUpdateAssessment = !isLocked
    && await canAuthorizeReviewRuntimeAction(event, 'save_assessment', runtimeEntity)

  const pinnedDefinition = review.egcs_cn_definition
  const publishedSchema = pinnedDefinition as unknown as PublishedReviewSchemaDefinition
  const schemaContentSource: ReviewSchemaContentSource = {
    egcs_cn_scoringmatrix: publishedSchema.scoringMatrix,
    egcs_cn_assessmentschema: publishedSchema.assessmentSchema
  }
  let runtimeSchema: AssessmentRuntimeSchema
  try {
    runtimeSchema = normalizeAssessmentRuntimeSchema(schemaContentSource)
  } catch (error) {
    if (error instanceof InvalidPersistedAssessmentDefinitionError) {
      return await throwApiError(event, {
        statusCode: 500,
        code: 'ASSESSMENT_DEFINITION_INVALID',
        key: 'apiErrors.assessment.definition_invalid'
      })
    }
    throw error
  }
  const egcsCnReviewAlignment = review.egcs_cn_reviewalignment === true
  const egcsCnReviewAlignResult = review.egcs_cn_reviewalignresult === null || review.egcs_cn_reviewalignresult === undefined
    ? null
    : Number(review.egcs_cn_reviewalignresult)
  const egcsCnReviewAlignmentNarrative = review.egcs_cn_reviewalignmentnarrative ?? ''

  const [responses, outcomes, customOutcomes, totalAdditionalReviewerCount, pendingAdditionalReviewerCount] = await Promise.all([
    db
      .selectFrom('Common_Review_Response')
      .select([
        'egcs_cn_section as section',
        'egcs_cn_subsection as subsection',
        'egcs_cn_question as question',
        'egcs_cn_value as value',
        'egcs_cn_comment as comment',
        'egcs_cn_calculated as calculated'
      ])
      .where('egcs_cn_assessment', '=', String(review.id))
      .where('Common_Review_Response._deleted', '=', false)
      .execute(),
    db
      .selectFrom('Common_Assessment_Outcome')
      .select([
        'egcs_cn_section as section',
        'egcs_cn_subsection as subsection',
        'egcs_cn_name_en as nameEn',
        'egcs_cn_name_fr as nameFr',
        'egcs_cn_recommendedstrategy as recommendedStrategy',
        'egcs_cn_selectedstrategy as selectedStrategy',
        'egcs_cn_accepted as accepted',
        'egcs_cn_justification as justification',
        'egcs_cn_comment as comment'
      ])
      .where('egcs_cn_review', '=', String(review.id))
      .where('Common_Assessment_Outcome._deleted', '=', false)
      .execute(),
    db
      .selectFrom('Common_Assessment_Custom_Outcome')
      .select([
        'id',
        'egcs_cn_name as name',
        'egcs_cn_outcome as outcome'
      ])
      .where('egcs_cn_review', '=', String(review.id))
      .where('Common_Assessment_Custom_Outcome._deleted', '=', false)
      .execute(),
    countReviewAdditionalReviewers(db, String(review.id)),
    countPendingReviewAdditionalReviewers(db, String(review.id))
  ])

  const assessmentResponse = {
    answers: responses.filter(answer => answer.calculated !== true).map(answer => ({
      section: answer.section,
      subsection: answer.subsection,
      question: answer.question,
      value: answer.value === null || answer.value === undefined ? null : Number(answer.value),
      comment: answer.comment ?? ''
    })),
    outcomes: outcomes.map(outcome => ({
      section: outcome.section,
      subsection: outcome.subsection,
      nameEn: outcome.nameEn,
      nameFr: outcome.nameFr,
      recommendedStrategy: outcome.recommendedStrategy,
      selectedStrategy: outcome.selectedStrategy,
      accepted: Boolean(outcome.accepted),
      justification: outcome.justification ?? '',
      comment: outcome.comment ?? ''
    })),
    customOutcomes: customOutcomes.map(customOutcome => ({
      id: String(customOutcome.id),
      name: customOutcome.name ?? '',
      outcome: customOutcome.outcome ?? ''
    })),
    egcs_cn_reviewalignment: egcsCnReviewAlignment,
    egcs_cn_reviewalignresult: egcsCnReviewAlignResult,
    egcs_cn_reviewalignmentnarrative: egcsCnReviewAlignmentNarrative
  }

  const runtime = buildAssessmentRuntimeSummary(
    assessmentResponse,
    runtimeSchema,
    review.egcs_cn_helpers as Record<string, unknown> | null | undefined,
    {
      reviewAlignmentDisabled: review.egcs_cn_disablealignment === true,
      reviewersDisabled: review.egcs_cn_disablereviewers === true,
      totalAdditionalReviewerCount,
      pendingAdditionalReviewerCount,
      isReviewLocked: isLocked
    }
  )

  return {
    id: String(review.id),
    runtimeId: String(review.runtimeId),
    runtimeItemId: String(review.runtimeItemId),
    runtimeState: review.runtimeState,
    attempt: Number(review.attempt),
    previousRuntimeId: review.previousRuntimeId === null ? null : String(review.previousRuntimeId),
    publicationVersionId: String(review.publicationVersionId),
    egcs_cn_reviewresult: Number(review.egcs_cn_reviewresult),
    egcs_cn_reviewset: String(review.egcs_cn_reviewset),
    egcs_cn_reviewschema: String(review.egcs_cn_reviewschema),
    egcs_cn_helpers: review.egcs_cn_helpers,
    egcs_cn_disablecustomoutcomes: review.egcs_cn_disablecustomoutcomes,
    egcs_cn_disablealignment: review.egcs_cn_disablealignment,
    egcs_cn_disablereviewers: review.egcs_cn_disablereviewers,
    egcs_cn_reviewalignment: egcsCnReviewAlignment,
    egcs_cn_reviewalignresult: egcsCnReviewAlignResult,
    egcs_cn_reviewalignmentnarrative: egcsCnReviewAlignmentNarrative,
    egcs_cn_entitytype: review.egcs_cn_entitytype,
    egcs_cn_entityid: String(review.egcs_cn_entityid),
    egcs_cn_transferpaymentstream: review.egcs_cn_scopetype === 'transferpaymentstream'
      ? String(review.egcs_cn_scopeid)
      : null,
    egcs_cn_agency: publishedSchema.agencyId,
    egcs_cn_name_en: publishedSchema.name.en,
    egcs_cn_name_fr: publishedSchema.name.fr,
    egcs_cn_outcomename_en: publishedSchema.outcomeName.en,
    egcs_cn_outcomename_fr: publishedSchema.outcomeName.fr,
    publicationVersion: Number(review.egcs_cn_pinnedversion),
    egcs_cn_scoringmatrix: runtimeSchema.scoringMatrix,
    egcs_cn_assessmentschema: {
      helpers: runtimeSchema.helpers,
      sections: runtimeSchema.sections,
      sectionMatrix: runtimeSchema.sectionMatrix,
      outcomes: runtimeSchema.outcomes,
      impactors: runtimeSchema.impactors
    },
    entity_name_en: review.entity_name_en ?? '',
    entity_name_fr: review.entity_name_fr ?? '',
    entity_operating_name_en: review.entity_operating_name_en ?? '',
    entity_operating_name_fr: review.entity_operating_name_fr ?? '',
    permissions: {
      can_read: true,
      can_update: canUpdateAssessment
    },
    reviewRuntime: {
      is_locked: isLocked,
      total_additional_reviewer_count: totalAdditionalReviewerCount,
      pending_additional_reviewer_count: pendingAdditionalReviewerCount
    },
    assessmentResponse,
    runtime
  }
})
