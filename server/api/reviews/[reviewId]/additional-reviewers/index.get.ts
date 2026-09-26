import { badRequest, notFound } from '~~/server/utils/api-errors'
import {
  resolveAdditionalReviewerExecutableContextFromReview,
  resolveCurrentCommonUser
} from '~~/server/utils/additional-reviewer-runtime'
import { authorizeReviewRuntimeAction, canAuthorizeReviewRuntimeAction } from '~~/server/utils/review-runtime-access'
import { isReviewLockedStatus } from '~~/server/utils/review-runtime-state'
import { requireAuthContext } from '~~/server/utils/authorize'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

type AdditionalReviewerItem = {
  id: string
  egcs_cn_comments: string
  egcs_cn_user: string | null
  egcs_cn_group: string | null
  egcs_cn_group_name_en: string | null
  egcs_cn_group_name_fr: string | null
  egcs_cn_user_name: string
  egcs_cn_completedat: string | null
  can_update: boolean
  can_complete: boolean
  can_delete: boolean
}

type AdditionalReviewersResponse = {
  items: AdditionalReviewerItem[]
  total: number
  stats: {
    total: number
    active: number
  }
  page: number
  limit: number
}

export default defineEventHandler(async (event): Promise<AdditionalReviewersResponse> => {
  const db = event.context.$db
  await requireAuthContext(event)
  const reviewId = getRouterParam(event, 'reviewId')

  if (!reviewId) {
    return await badRequest(event, 'MISSING_REVIEW_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(reviewId)) {
    return await notFound(event, 'ASSESSMENT_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  const executableContext = await resolveAdditionalReviewerExecutableContextFromReview(db, reviewId)
  if (!executableContext) {
    return await notFound(event, 'ASSESSMENT_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  // Additional reviewers are stored against the executable runtime entity, but visibility still
  // resolves through the same parent-entity read gate as the assessment itself.
  try {
    await authorizeReviewRuntimeAction(event, 'read_assessment', executableContext.runtimeEntity)
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'statusCode' in error && Number(error.statusCode) === 403) {
      return await notFound(event, 'ASSESSMENT_NOT_FOUND', 'apiErrors.admin_common.not_found')
    }
    throw error
  }

  const canDelete = !isReviewLockedStatus(executableContext.reviewRuntimeState, executableContext.reviewSetRuntimeState)
    && await canAuthorizeReviewRuntimeAction(event, 'delete_assessment_child', executableContext.runtimeEntity)

  const currentCommonUser = await resolveCurrentCommonUser(event)
  const rows = await db
    .selectFrom('Common_Additional_Reviewers')
    .leftJoin('Common_User', 'Common_User.id', 'Common_Additional_Reviewers.egcs_cn_user')
    .leftJoin('Common_Group', 'Common_Group.id', 'Common_Additional_Reviewers.egcs_cn_group')
    .select([
      'Common_Additional_Reviewers.id as id',
      'Common_Additional_Reviewers.egcs_cn_comments as comments',
      'Common_Additional_Reviewers.egcs_cn_user as assigned_user_id',
      'Common_Additional_Reviewers.egcs_cn_group as assigned_group_id',
      'Common_Additional_Reviewers.egcs_cn_completedat as completed_at',
      'Common_User.egcs_cn_name as assigned_user_name',
      'Common_Group.egcs_cn_name_en as assigned_group_name_en',
      'Common_Group.egcs_cn_name_fr as assigned_group_name_fr'
    ])
    .where('Common_Additional_Reviewers.egcs_cn_entitytype', '=', 'commonreview')
    .where('Common_Additional_Reviewers.egcs_cn_entityid', '=', reviewId)
    .where('Common_Additional_Reviewers._deleted', '=', false)
    .where(eb => eb.or([
      eb('Common_User._deleted', '=', false),
      eb('Common_Group._deleted', '=', false)
    ]))
    .orderBy('Common_Additional_Reviewers.id', 'asc')
    .execute()

  const items: AdditionalReviewerItem[] = rows.map(row => {
    const assignedUserId = row.assigned_user_id ? String(row.assigned_user_id) : null
    const completedAt = row.completed_at ? new Date(row.completed_at).toISOString() : null
    const canUpdate = currentCommonUser?.id === assignedUserId
      && completedAt === null
      && !isReviewLockedStatus(
        executableContext.reviewRuntimeState,
        executableContext.reviewSetRuntimeState
      )

    return {
      id: String(row.id),
      egcs_cn_comments: row.comments ?? '',
      egcs_cn_user: assignedUserId,
      egcs_cn_group: row.assigned_group_id ? String(row.assigned_group_id) : null,
      egcs_cn_group_name_en: row.assigned_group_name_en,
      egcs_cn_group_name_fr: row.assigned_group_name_fr,
      egcs_cn_user_name: row.assigned_user_name ?? '',
      egcs_cn_completedat: completedAt,
      can_update: canUpdate,
      can_complete: canUpdate,
      can_delete: canDelete
    }
  })

  return {
    items,
    total: items.length,
    stats: {
      total: items.length,
      active: items.filter(item => item.egcs_cn_completedat === null).length
    },
    page: 1,
    limit: items.length || 1
  }
})
