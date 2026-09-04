import type { Kysely, Transaction } from 'kysely'
import type { H3Event } from 'h3'
import { z } from 'zod'
import type { RuntimeState } from '~~/shared/constants/system-lifecycle'
import { parseI18n } from '~~/server/utils/api-validate'
import { normalizeAssessmentRuntimeSchema } from '~~/server/utils/assessment-runtime-schema'
import type { ReviewSchemaContentSource } from '~~/server/utils/review-schema-versioning'
import type { Database, JsonValue } from '~~/shared/types/database'
import {
  createAssessmentResponseValidationSchema,
  type AssessmentResponse
} from '~~/shared/types/schemas/assessment/assessmentresponse'
import type { AssessmentRuntimeSummary } from '~~/shared/types/schemas/assessment/currentassessment'
import { buildAssessmentRuntimeSummary } from '~~/shared/utils/assessment'
import { isRepresentableByNumeric } from '~~/shared/utils/decimal'

const PersistedAssessmentNumericSchema = z.number()
  .finite({ error: 'validation.invalid_number' })
  .refine(value => isRepresentableByNumeric(value, 10, 2), { error: 'validation.numeric_not_representable' })

const AssessmentDerivedPersistenceSchema = z.object({
  reviewResult: PersistedAssessmentNumericSchema,
  reviewAlignmentResult: PersistedAssessmentNumericSchema.nullable(),
  calculatedAnswers: z.array(z.object({
    value: PersistedAssessmentNumericSchema
  }))
})

export type AssessmentMutationReview = {
  id: string | number
  runtimeId: string | number
  runtimeItemId: string | number
  runtimeState: RuntimeState
  attempt: number
  previousRuntimeId: string | number | null
  egcs_cn_reviewset: string | number
  reviewSetRuntimeState: RuntimeState
  egcs_cn_reviewschema: string | number
  publicationVersionId: string | number
  egcs_cn_pinnedversion?: number | string | null
  egcs_cn_definition?: JsonValue | null
  egcs_cn_helpers?: JsonValue
  egcs_cn_disablecustomoutcomes: boolean
  egcs_cn_disablealignment: boolean
  egcs_cn_disablereviewers?: boolean | null
  egcs_cn_failurethreshold: number | string | null
  egcs_cn_reviewalignment?: boolean | null
  egcs_cn_reviewalignresult?: number | string | null
  egcs_cn_reviewalignmentnarrative?: string | null
  egcs_cn_entitytype?: string
  egcs_cn_entityid?: string | number
  egcs_cn_agency?: string | number
  egcs_cn_name_en?: string
  egcs_cn_name_fr?: string
  egcs_cn_outcomename_en?: string
  egcs_cn_outcomename_fr?: string
  egcs_cn_version?: number
}

/**
 * Resolves only the immutable pinned schema-version payload.
 * Missing or malformed definitions intentionally yield empty content.
 *
 * @param review - Runtime assessment and its pinned schema-version definition.
 * @returns Schema content used for assessment normalization and validation.
 */
const getPinnedAssessmentContent = (review: AssessmentMutationReview): ReviewSchemaContentSource => {
  const definition = review.egcs_cn_definition
  if (definition !== null && definition !== undefined && typeof definition === 'object' && !Array.isArray(definition)) {
    return {
      egcs_cn_scoringmatrix: 'scoringMatrix' in definition ? definition.scoringMatrix as JsonValue : null,
      egcs_cn_assessmentschema: 'assessmentSchema' in definition ? definition.assessmentSchema as JsonValue : null
    }
  }
  return { egcs_cn_scoringmatrix: null, egcs_cn_assessmentschema: null }
}

export type PersistedAssessmentResponse = AssessmentResponse & {
  customOutcomes: Array<{
    id?: string | number
    name: string
    outcome: string
  }>
}

export type AssessmentPersistenceResult = {
  runtimeSchema: ReturnType<typeof normalizeAssessmentRuntimeSchema>
  runtime: AssessmentRuntimeSummary
  normalizedAssessmentResponse: PersistedAssessmentResponse
  persistedCustomOutcomes: Array<{
    id?: string | number
    name: string
    outcome: string
  }>
  reviewResult: number
  normalizedReviewAlignment: boolean
  normalizedReviewAlignmentResult: number | null
  normalizedReviewAlignmentNarrative: string | null
}

/**
 * Normalizes persisted helper JSON into the record shape expected by assessment runtime helpers.
 *
 * @param value - Stored helper JSON from the review row.
 * @returns Helper record when the JSON is an object, otherwise `null`.
 */
const getHelperRecord = (value: JsonValue | undefined): Record<string, unknown> | null => (
  value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

/**
 * Normalizes and validates the current assessment payload against the active review schema.
 *
 * This helper is shared by both the save route and the completion route so that "save draft"
 * and "save + complete" follow exactly the same server-side rules. Completion simply turns on
 * the stricter `enforceCompletion` option before persistence.
 *
 * @param event - Active H3 event used for localized validation messages.
 * @param review - Loaded review row plus schema content and feature flags.
 * @param input - Current assessment response sent by the client.
 * @param options - Controls whether completion-level validation should be enforced.
 * @param options.enforceCompletion - Enables strict completion validation when true.
 * @returns Normalized runtime schema, runtime summary, and persistence-ready assessment state.
 */
export const prepareAssessmentPersistence = async (
  event: H3Event,
  review: AssessmentMutationReview,
  input: AssessmentResponse,
  options: {
    enforceCompletion: boolean
  }
): Promise<AssessmentPersistenceResult> => {
  const helperValues = getHelperRecord(review.egcs_cn_helpers)
  const schemaContentSource = getPinnedAssessmentContent(review)
  const runtimeSchema = normalizeAssessmentRuntimeSchema(schemaContentSource)

  const assessmentResponse = await parseI18n(
    event,
    createAssessmentResponseValidationSchema(
      {
        helpers: runtimeSchema.helpers,
        sections: runtimeSchema.sections,
        sectionMatrix: runtimeSchema.sectionMatrix,
        outcomes: runtimeSchema.outcomes,
        impactors: runtimeSchema.impactors
      },
      runtimeSchema.scoringMatrix,
      helperValues,
      {
        enforceCompletion: options.enforceCompletion,
        disableCustomOutcomes: review.egcs_cn_disablecustomoutcomes,
        disableAlignment: review.egcs_cn_disablealignment
      }
    ),
    input
  )

  const runtime = buildAssessmentRuntimeSummary(
    assessmentResponse,
    runtimeSchema,
    helperValues
  )

  const normalizedAssessmentResponse: PersistedAssessmentResponse = {
    answers: assessmentResponse.answers,
    outcomes: runtime.generatedOutcomes.map(outcome => ({
      section: outcome.section,
      subsection: outcome.subsection,
      nameEn: outcome.nameEn,
      nameFr: outcome.nameFr,
      recommendedStrategy: outcome.recommendedStrategy,
      selectedStrategy: outcome.selectedStrategy,
      accepted: outcome.accepted,
      justification: outcome.selectedStrategy === outcome.recommendedStrategy ? '' : outcome.justification,
      comment: outcome.comment
    })),
    egcs_cn_reviewalignment: assessmentResponse.egcs_cn_reviewalignment === true,
    egcs_cn_reviewalignresult: assessmentResponse.egcs_cn_reviewalignresult ?? null,
    egcs_cn_reviewalignmentnarrative: assessmentResponse.egcs_cn_reviewalignmentnarrative,
    customOutcomes: assessmentResponse.customOutcomes.map(customOutcome => ({
      id: customOutcome.id,
      name: customOutcome.name.trim(),
      outcome: customOutcome.outcome.trim()
    }))
  }

  const reviewResult = runtime.score.weightedScore
  const normalizedReviewAlignment = review.egcs_cn_disablealignment === true
    ? false
    : assessmentResponse.egcs_cn_reviewalignment === true
  const normalizedReviewAlignmentResult = normalizedReviewAlignment
    ? assessmentResponse.egcs_cn_reviewalignresult ?? null
    : null
  const normalizedReviewAlignmentNarrative = normalizedReviewAlignment
    ? assessmentResponse.egcs_cn_reviewalignmentnarrative.trim()
    : null

  await parseI18n(event, AssessmentDerivedPersistenceSchema, {
    reviewResult,
    reviewAlignmentResult: normalizedReviewAlignmentResult,
    calculatedAnswers: runtime.calculatedAnswers.map(answer => ({ value: answer.value }))
  })

  return {
    runtimeSchema,
    runtime,
    normalizedAssessmentResponse,
    persistedCustomOutcomes: normalizedAssessmentResponse.customOutcomes,
    reviewResult,
    normalizedReviewAlignment,
    normalizedReviewAlignmentResult,
    normalizedReviewAlignmentNarrative
  }
}

/**
 * Persists the normalized assessment response and aligned review status updates.
 *
 * The review completion route reuses this helper inside its completion transaction so the
 * latest unsaved UI state is committed before the review is finalized.
 *
 * @param trx - Open transaction used to persist all assessment-side changes atomically.
 * @param review - Loaded review row for identifiers and current statuses.
 * @param prepared - Normalized assessment state returned by `prepareAssessmentPersistence`.
 * @returns Persisted custom outcomes including generated ids.
 */
export const persistPreparedAssessment = async (
  trx: Transaction<Database>,
  review: AssessmentMutationReview,
  prepared: AssessmentPersistenceResult
): Promise<Array<{ id: string; name: string; outcome: string }>> => {
  await trx
    .updateTable('Common_Review_Response')
    .set({ _deleted: true })
    .where('egcs_cn_assessment', '=', String(review.id))
    .where('_deleted', '=', false)
    .execute()

  if (prepared.normalizedAssessmentResponse.answers.length > 0) {
    await trx
      .insertInto('Common_Review_Response')
      .values(prepared.normalizedAssessmentResponse.answers.map(answer => ({
        egcs_cn_section: answer.section,
        egcs_cn_subsection: answer.subsection,
        egcs_cn_question: answer.question,
        egcs_cn_value: answer.value ?? null,
        egcs_cn_comment: answer.comment,
        egcs_cn_calculated: false,
        egcs_cn_assessment: String(review.id),
        _deleted: false
      })))
      .execute()
  }

  if (prepared.runtime.calculatedAnswers.length > 0) {
    await trx
      .insertInto('Common_Review_Response')
      .values(prepared.runtime.calculatedAnswers.map(answer => ({
        egcs_cn_section: answer.section,
        egcs_cn_subsection: answer.subsection,
        egcs_cn_question: answer.question,
        egcs_cn_value: answer.value,
        egcs_cn_comment: '',
        egcs_cn_calculated: true,
        egcs_cn_assessment: String(review.id),
        _deleted: false
      })))
      .execute()
  }

  await trx
    .updateTable('Common_Assessment_Outcome')
    .set({ _deleted: true })
    .where('egcs_cn_review', '=', String(review.id))
    .where('_deleted', '=', false)
    .execute()

  if (prepared.normalizedAssessmentResponse.outcomes.length > 0) {
    await trx
      .insertInto('Common_Assessment_Outcome')
      .values(prepared.normalizedAssessmentResponse.outcomes.map(outcome => ({
        egcs_cn_review: String(review.id),
        egcs_cn_section: outcome.section,
        egcs_cn_subsection: outcome.subsection,
        egcs_cn_name_en: outcome.nameEn,
        egcs_cn_name_fr: outcome.nameFr,
        egcs_cn_recommendedstrategy: outcome.recommendedStrategy,
        egcs_cn_accepted: outcome.accepted,
        egcs_cn_selectedstrategy: outcome.selectedStrategy,
        egcs_cn_justification: outcome.justification,
        egcs_cn_comment: outcome.comment,
        _deleted: false
      })))
      .execute()
  }

  await trx
    .updateTable('Common_Assessment_Custom_Outcome')
    .set({ _deleted: true })
    .where('egcs_cn_review', '=', String(review.id))
    .where('_deleted', '=', false)
    .execute()

  let persistedCustomOutcomes = prepared.persistedCustomOutcomes.map(customOutcome => ({
    id: String(customOutcome.id ?? ''),
    name: customOutcome.name,
    outcome: customOutcome.outcome
  }))

  if (prepared.normalizedAssessmentResponse.customOutcomes.length > 0) {
    persistedCustomOutcomes = await trx
      .insertInto('Common_Assessment_Custom_Outcome')
      .values(prepared.normalizedAssessmentResponse.customOutcomes.map(customOutcome => ({
        egcs_cn_review: String(review.id),
        egcs_cn_name: customOutcome.name,
        egcs_cn_outcome: customOutcome.outcome,
        _deleted: false
      })))
      .returning([
        'id',
        'egcs_cn_name as name',
        'egcs_cn_outcome as outcome'
      ])
      .execute()
      .then(rows => rows.map(row => ({
        id: String(row.id),
        name: row.name,
        outcome: row.outcome
      })))
  }

  await trx
    .updateTable('Common_Review')
    .set({
      egcs_cn_reviewresult: prepared.reviewResult,
      egcs_cn_reviewalignment: prepared.normalizedReviewAlignment,
      egcs_cn_reviewalignresult: prepared.normalizedReviewAlignmentResult,
      egcs_cn_reviewalignmentnarrative: prepared.normalizedReviewAlignmentNarrative
    })
    .where('id', '=', String(review.id))
    .execute()

  return persistedCustomOutcomes
}

/**
 * Loads the shared review + schema row shape needed by both save and completion mutations.
 *
 * @param db - Database connection.
 * @param reviewId - Runtime review id.
 * @returns Review row with active schema content, or null when not found.
 */
export const getAssessmentMutationReview = async (
  db: Kysely<Database>,
  reviewId: string
): Promise<AssessmentMutationReview | null> => await db
  .selectFrom('Common_Review')
  .innerJoin('Common_Review_Set', 'Common_Review_Set.id', 'Common_Review.egcs_cn_reviewset')
  .innerJoin('Common_Runtime_Item as Review_Item', 'Review_Item.id', 'Common_Review.egcs_cn_runtimeitem')
  .innerJoin('Common_Runtime_Item as Review_Set_Item', 'Review_Set_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
  .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Review_Item.egcs_cn_runtime')
  .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review.egcs_cn_reviewschema')
  .innerJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Review_Item.egcs_cn_publicationversion')
  .select([
    'Common_Review.id as id',
    'Common_Runtime.id as runtimeId',
    'Common_Runtime.egcs_cn_attempt as attempt',
    'Common_Runtime.egcs_cn_previousruntime as previousRuntimeId',
    'Review_Item.id as runtimeItemId',
    'Review_Item.egcs_cn_state as runtimeState',
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
    'Common_Review.egcs_cn_failurethreshold as egcs_cn_failurethreshold',
    'Common_Review.egcs_cn_reviewalignment as egcs_cn_reviewalignment',
    'Common_Review.egcs_cn_reviewalignresult as egcs_cn_reviewalignresult',
    'Common_Review.egcs_cn_reviewalignmentnarrative as egcs_cn_reviewalignmentnarrative',
    'Common_Review_Set.egcs_cn_entitytype as egcs_cn_entitytype',
    'Common_Review_Set.egcs_cn_entityid as egcs_cn_entityid',
    'Common_Review_Schema.egcs_cn_agency as egcs_cn_agency',
    'Common_Review_Schema.egcs_cn_name_en as egcs_cn_name_en',
    'Common_Review_Schema.egcs_cn_name_fr as egcs_cn_name_fr',
    'Common_Review_Schema.egcs_cn_outcomename_en as egcs_cn_outcomename_en',
    'Common_Review_Schema.egcs_cn_outcomename_fr as egcs_cn_outcomename_fr',
    'Common_Publication_Version.egcs_cn_version as egcs_cn_version'
  ])
  .where('Common_Review.id', '=', reviewId)
  .where('Common_Review._deleted', '=', false)
  .where('Common_Review_Set._deleted', '=', false)
  .where('Review_Item._deleted', '=', false)
  .where('Review_Set_Item._deleted', '=', false)
  .where('Common_Review_Schema.egcs_cn_reviewtype', '=', 'assessment')
  .executeTakeFirst()
  ?? null
