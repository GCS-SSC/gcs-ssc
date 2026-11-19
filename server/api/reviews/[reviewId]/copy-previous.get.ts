import { defineEventHandler, getRouterParam } from 'h3'
import { z } from 'zod'
import type { ReviewCopyResult } from '~~/shared/types/review-copy'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { notFound } from '~~/server/utils/api-errors'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { requireAuthContext } from '~~/server/utils/authorize'
import { getAssessmentMutationReview } from '~~/server/utils/assessment-runtime-persistence'
import { loadAssessmentResponse, prepareAssessmentCopy } from '~~/server/utils/assessment-runtime-response'
import { getChecklistMutationReview, loadChecklistResponses, prepareChecklistPersistence } from '~~/server/utils/checklist-runtime-persistence'
import {
  authorizeReviewRuntimeAction,
  authorizeWorkflowOwnerRead,
  canAuthorizeWorkflowOwnerRead,
  resolveReviewRuntimeEntityFromReview
} from '~~/server/utils/review-runtime-access'
import { assertReviewNotLocked } from '~~/server/utils/review-runtime-state'

const QuerySchema = z.object({
  kind: z.enum(['assessment', 'checklist'], { error: 'validation.invalid_selection' }),
  source: PositivePostgresBigintIdSchema.optional()
})

export default defineEventHandler(async (event): Promise<ReviewCopyResult> => {
  const db = event.context.$db
  await requireAuthContext(event)
  const reviewId = getRouterParam(event, 'reviewId')
  const missing = () => notFound(event, 'REVIEW_COPY_NOT_FOUND', 'apiErrors.admin_common.not_found')
  if (!reviewId || !isPositivePostgresBigintText(reviewId)) return await missing()

  const { kind, source } = await getValidatedQueryI18n(event, QuerySchema)
  const [target, entity] = await Promise.all([
    kind === 'assessment' ? getAssessmentMutationReview(db, reviewId) : getChecklistMutationReview(db, reviewId),
    resolveReviewRuntimeEntityFromReview(db, reviewId)
  ])
  if (!target || !entity) return await missing()
  await authorizeReviewRuntimeAction(event, 'save_assessment', entity)
  await authorizeWorkflowOwnerRead(event, entity)
  await assertReviewNotLocked(event, target.runtimeState, target.reviewSetRuntimeState)

  const history = db.selectFrom('Common_Completion as completion')
    .innerJoin('Common_Review as review', 'review.id', 'completion.egcs_cn_entityid')
    .innerJoin('Common_Review_Set as reviewSet', 'reviewSet.id', 'review.egcs_cn_reviewset')
    .innerJoin('Common_Runtime_Item as item', 'item.id', 'review.egcs_cn_runtimeitem')
    .select([
      'review.id as id',
      'completion.egcs_cn_completedat as completedAt',
      'item.egcs_cn_state as outcome',
      'item.egcs_cn_publicationversion as version'
    ])
    .where('completion.egcs_cn_entitytype', '=', 'commonreview')
    .where('completion._deleted', '=', false)
    .where('review._deleted', '=', false)
    .where('reviewSet._deleted', '=', false)
    .where('item._deleted', '=', false)
    .where('review.id', '!=', reviewId)
    .where('review.egcs_cn_reviewschema', '=', String(target.egcs_cn_reviewschema))
    .where('reviewSet.egcs_cn_entitytype', '=', entity.entityType)
    .where('reviewSet.egcs_cn_entityid', '=', entity.entityId)
    .orderBy('completion.egcs_cn_completedat', 'desc')
    .orderBy('completion.id', 'desc')

  const versionId = String(target.publicationVersionId)
  if (!source) {
    const rows = await history.execute()
    const readable = await Promise.all(rows.map(async row => {
      const context = await resolveReviewRuntimeEntityFromReview(db, row.id)
      return context && await canAuthorizeWorkflowOwnerRead(event, context) ? row : null
    }))
    const submissions = readable.filter(row => row !== null)
    if (!submissions.length) return { kind: 'no_history' }
    const choices = submissions.flatMap(({ id, completedAt, outcome, version }, index) => version === versionId
      ? [{ id, completedAt: new Date(completedAt).toISOString(), outcome, isLatest: index === 0 }]
      : [])
    return choices.length ? { kind: 'choices', choices } : { kind: 'version_mismatch' }
  }

  const selected = await history.where('review.id', '=', source).executeTakeFirst()
  if (!selected) return await missing()
  const sourceEntity = await resolveReviewRuntimeEntityFromReview(db, selected.id)
  if (!sourceEntity) return await missing()
  await authorizeWorkflowOwnerRead(event, sourceEntity)
  if (selected.version !== versionId) return { kind: 'version_mismatch' }

  if ('checklistId' in target) {
    const previous = await getChecklistMutationReview(db, source)
    if (!previous) return await missing()
    const responses = await loadChecklistResponses(db, String(previous.checklistId))
    const prepared = await prepareChecklistPersistence(event, target, { responses }, { enforceCompletion: false })
    return { kind: 'checklist', response: prepared.response.responses }
  }

  const previous = await getAssessmentMutationReview(db, source)
  if (!previous) return await missing()
  const saved = await loadAssessmentResponse(db, previous)
  return { kind: 'assessment', response: await prepareAssessmentCopy(event, target, saved) }
})
