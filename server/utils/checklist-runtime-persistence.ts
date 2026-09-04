/* eslint-disable jsdoc/require-jsdoc -- checklist persistence contracts are covered by focused tests */
import type { Kysely, Transaction } from 'kysely'
import type { H3Event } from 'h3'
import { z } from 'zod'
import type { RuntimeState } from '~~/shared/constants/system-lifecycle'
import type { Database, JsonValue } from '~~/shared/types/database'
import {
  ChecklistDefinitionSchema,
  ChecklistResponseEnvelopeSchema,
  type ChecklistDefinition,
  type ChecklistResponseEnvelope
} from '~~/shared/types/schemas/checklist/checklist'
import {
  evaluateChecklist,
  getChecklistSectionQuestions,
  validateChecklistResponses,
  type ChecklistEvaluation
} from '~~/shared/utils/checklist-evaluation'
import { parseI18n } from './api-validate'
import { notFound } from './api-errors'

export type ChecklistMutationReview = {
  id: string | number
  checklistId: string | number
  runtimeId: string | number
  runtimeItemId: string | number
  runtimeState: RuntimeState
  attempt: number
  previousRuntimeId: string | number | null
  egcs_cn_reviewset: string | number
  reviewSetRuntimeState: RuntimeState
  egcs_cn_reviewschema: string | number
  publicationVersionId: string | number
  egcs_cn_pinnedversion?: number | null
  egcs_cn_disablereviewers: boolean
  egcs_cn_failonchecklistfailure: boolean
  egcs_cn_definition: JsonValue | null
}

const resolveChecklistDefinition = async (
  event: H3Event,
  review: ChecklistMutationReview
): Promise<ChecklistDefinition> => {
  const versionDefinition = review.egcs_cn_definition
  const versionEnvelope = versionDefinition !== null
    && typeof versionDefinition === 'object'
    && !Array.isArray(versionDefinition)
    && 'checklistSchema' in versionDefinition
    ? versionDefinition.checklistSchema
    : versionDefinition
  const source = versionEnvelope
  if (source === null || source === undefined) {
    return await notFound(event, 'CHECKLIST_DEFINITION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  return await parseI18n(event, ChecklistDefinitionSchema, source)
}

const createChecklistMutationSchema = (definition: ChecklistDefinition, enforceCompletion: boolean) => (
  ChecklistResponseEnvelopeSchema.superRefine((value, ctx) => {
    validateChecklistResponses(definition, value.responses, enforceCompletion).forEach(issue => {
      const messageByType = {
        missing_required_answer: 'validation.checklist_answer_required',
        missing_required_comment: 'validation.checklist_comment_required',
        unknown_question: 'validation.checklist_unknown_question'
      } as const
      const responseIndex = value.responses.findIndex(response => response.questionKey === issue.questionKey)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: messageByType[issue.type],
        path: responseIndex === -1 ? ['responses'] : ['responses', responseIndex]
      })
    })
  })
)

export const getChecklistMutationReview = async (
  db: Kysely<Database>,
  reviewId: string
): Promise<ChecklistMutationReview | null> => await db
  .selectFrom('Common_Review')
  .innerJoin('Common_Review_Set', 'Common_Review_Set.id', 'Common_Review.egcs_cn_reviewset')
  .innerJoin('Common_Runtime_Item as Review_Item', 'Review_Item.id', 'Common_Review.egcs_cn_runtimeitem')
  .innerJoin('Common_Runtime_Item as Review_Set_Item', 'Review_Set_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
  .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Review_Item.egcs_cn_runtime')
  .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review.egcs_cn_reviewschema')
  .innerJoin('Common_Checklist', 'Common_Checklist.egcs_cn_review', 'Common_Review.id')
  .innerJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Review_Item.egcs_cn_publicationversion')
  .select([
    'Common_Review.id as id',
    'Common_Checklist.id as checklistId',
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
    'Common_Review.egcs_cn_disablereviewers as egcs_cn_disablereviewers',
    'Common_Review.egcs_cn_failonchecklistfailure as egcs_cn_failonchecklistfailure',
    'Common_Publication_Version.egcs_cn_definition as egcs_cn_definition'
  ])
  .where('Common_Review.id', '=', reviewId)
  .where('Common_Review._deleted', '=', false)
  .where('Common_Review_Set._deleted', '=', false)
  .where('Common_Review_Schema.egcs_cn_reviewtype', '=', 'checklist')
  .where('Common_Checklist._deleted', '=', false)
  .executeTakeFirst() ?? null

export const prepareChecklistPersistence = async (
  event: H3Event,
  review: ChecklistMutationReview,
  input: ChecklistResponseEnvelope,
  options: { enforceCompletion: boolean }
) => {
  const definition = await resolveChecklistDefinition(event, review)
  const response = await parseI18n(event, createChecklistMutationSchema(definition, options.enforceCompletion), input)
  const evaluation = evaluateChecklist(definition, response.responses)
  return { definition, response, evaluation }
}

export const persistPreparedChecklist = async (
  trx: Transaction<Database>,
  review: ChecklistMutationReview,
  prepared: Awaited<ReturnType<typeof prepareChecklistPersistence>>
): Promise<void> => {
  await trx.updateTable('Common_Checklist_Response')
    .set({ _deleted: true })
    .where('egcs_cn_checklist', '=', String(review.checklistId))
    .where('_deleted', '=', false)
    .execute()

  const sectionByQuestion = new Map(prepared.definition.sections.flatMap(section => (
    getChecklistSectionQuestions(section).map(question => [question.key, section.key] as const)
  )))
  if (prepared.response.responses.length > 0) {
    await trx.insertInto('Common_Checklist_Response').values(prepared.response.responses.map(response => {
      const sectionKey = sectionByQuestion.get(response.questionKey)
      if (sectionKey === undefined) throw new Error(`Unknown checklist question: ${response.questionKey}`)
      return {
        egcs_cn_checklist: String(review.checklistId),
        egcs_cn_section: sectionKey,
        egcs_cn_question: response.questionKey,
        egcs_cn_answer: response.answer,
        egcs_cn_comment: response.comment ?? '',
        _deleted: false
      }
    })).execute()
  }

  await trx.updateTable('Common_Checklist').set({
    egcs_cn_result: prepared.evaluation.result,
    egcs_cn_evaluationtrace: prepared.evaluation.trace as unknown as JsonValue
  }).where('id', '=', String(review.checklistId)).execute()
}

export const loadChecklistResponses = async (
  db: Kysely<Database>,
  checklistId: string
) => await db.selectFrom('Common_Checklist_Response')
  .select([
    'egcs_cn_question as questionKey',
    'egcs_cn_answer as answer',
    'egcs_cn_comment as comment'
  ])
  .where('egcs_cn_checklist', '=', checklistId)
  .where('_deleted', '=', false)
  .orderBy('id', 'asc')
  .execute()

export const getChecklistDefinition = resolveChecklistDefinition
export type PreparedChecklistEvaluation = ChecklistEvaluation
