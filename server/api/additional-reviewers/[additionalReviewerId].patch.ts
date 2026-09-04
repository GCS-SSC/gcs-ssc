/* eslint-disable jsdoc/require-jsdoc -- Additional-reviewer route behavior is covered by focused runtime tests. */
import { badRequest, forbidden, notFound } from '~~/server/utils/api-errors'
import { requireAuthContext } from '~~/server/utils/authorize'
import {
  listAgencyScopedCommonUsers,
  type AdditionalReviewerRowContext,
  resolveAdditionalReviewerRowContext,
  resolveCurrentCommonUser
} from '~~/server/utils/additional-reviewer-runtime'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { AdditionalReviewerInputSchema } from '~~/shared/types/schemas/additional-reviewer'
import {
  authorizeReviewRuntimeAction,
  executeFreshAuthorizedReviewAdditionalReviewerWrite
} from '~~/server/utils/review-runtime-access'
import { assertReviewNotLocked } from '~~/server/utils/review-runtime-state'
import type { H3Event } from 'h3'
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

type AdditionalReviewerPatchBody = {
  egcs_cn_comments: string
  egcs_cn_user: string
}

type AdditionalReviewerUser = {
  id: string
  name: string
}

const readAdditionalReviewerId = async (event: H3Event) => {
  const additionalReviewerId = getRouterParam(event, 'additionalReviewerId')

  return additionalReviewerId
    ? { additionalReviewerId }
    : await badRequest(event, 'MISSING_ADDITIONAL_REVIEWER_ID', 'apiErrors.request.missing_id')
}

const loadAdditionalReviewerRowContext = async (
  event: H3Event,
  db: Kysely<Database>,
  additionalReviewerId: string
) => {
  const rowContext = await resolveAdditionalReviewerRowContext(db, additionalReviewerId)

  return rowContext
    ? rowContext
    : await notFound(event, 'ADDITIONAL_REVIEWER_NOT_FOUND', 'apiErrors.admin_common.not_found')
}

const assertAdditionalReviewerPatchAccess = async (
  event: H3Event,
  rowContext: AdditionalReviewerRowContext
) => {
  await authorizeReviewRuntimeAction(event, 'read_assessment', rowContext.runtimeEntity)
  await assertReviewNotLocked(event, rowContext.reviewRuntimeState, rowContext.reviewSetRuntimeState)

  const currentCommonUser = await resolveCurrentCommonUser(event)
  if (!currentCommonUser || currentCommonUser.id !== rowContext.row.assignedUserId) {
    return await forbidden(event)
  }

  if (rowContext.row.completedAt) {
    return await badRequest(event, 'ADDITIONAL_REVIEWER_ALREADY_COMPLETED', 'apiErrors.request.invalid')
  }

  return { currentCommonUser }
}

const listAllowedAdditionalReviewerUsers = async (
  event: H3Event,
  db: Kysely<Database>,
  rowContext: AdditionalReviewerRowContext
) => {
  if (!rowContext.runtimeEntity.schemaAgencyId) {
    return await badRequest(event, 'MISSING_SCHEMA_AGENCY', 'apiErrors.request.invalid')
  }

  return await listAgencyScopedCommonUsers(db, rowContext.runtimeEntity.schemaAgencyId)
}

const assertAdditionalReviewerAssigneeAllowed = async (
  event: H3Event,
  allowedUsers: AdditionalReviewerUser[],
  assignedUserId: string
) => {
  if (!allowedUsers.some(user => user.id === assignedUserId)) {
    return await badRequest(event, 'ADDITIONAL_REVIEWER_ASSIGNEE_INVALID', 'apiErrors.request.invalid')
  }

  return null
}

const updateAdditionalReviewerRow = async (
  db: Kysely<Database>,
  additionalReviewerId: string,
  body: AdditionalReviewerPatchBody
) => await db
  .updateTable('Common_Additional_Reviewers')
  .set({
    egcs_cn_comments: body.egcs_cn_comments,
    egcs_cn_user: body.egcs_cn_user
  })
  .where('id', '=', additionalReviewerId)
  .where('_deleted', '=', false)
  .returning([
    'id',
    'egcs_cn_comments',
    'egcs_cn_user',
    'egcs_cn_completedat'
  ])
  .executeTakeFirstOrThrow()

const mapAdditionalReviewerPatchResponse = (
  updated: Awaited<ReturnType<typeof updateAdditionalReviewerRow>>,
  body: AdditionalReviewerPatchBody,
  rowContext: AdditionalReviewerRowContext,
  allowedUsers: AdditionalReviewerUser[],
  currentCommonUserId: string
) => {
  const assignedUserName = allowedUsers.find(user => user.id === body.egcs_cn_user)?.name ?? rowContext.row.assignedUserName
  const currentOwnsRow = body.egcs_cn_user === currentCommonUserId

  return {
    id: String(updated.id),
    egcs_cn_comments: updated.egcs_cn_comments ?? '',
    egcs_cn_user: String(updated.egcs_cn_user),
    egcs_cn_user_name: assignedUserName,
    egcs_cn_completedat: updated.egcs_cn_completedat ? new Date(updated.egcs_cn_completedat).toISOString() : null,
    can_update: currentOwnsRow,
    can_complete: currentOwnsRow
  }
}

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const db = event.context.$db
  const idResult = await readAdditionalReviewerId(event)
  if (!('additionalReviewerId' in idResult)) {
    return idResult
  }

  const { additionalReviewerId } = idResult
  if (!isPositivePostgresBigintText(additionalReviewerId)) {
    return await notFound(event, 'ADDITIONAL_REVIEWER_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  const rowContext = await loadAdditionalReviewerRowContext(event, db, additionalReviewerId)
  if (!('row' in rowContext)) {
    return rowContext
  }

  const accessResult = await assertAdditionalReviewerPatchAccess(event, rowContext)
  if (!('currentCommonUser' in accessResult)) {
    return accessResult
  }

  const body = await readValidatedBodyI18n(event, AdditionalReviewerInputSchema) as AdditionalReviewerPatchBody
  return await executeFreshAuthorizedReviewAdditionalReviewerWrite(event, rowContext.runtimeEntity, async trx => {
    const currentRowContext = await loadAdditionalReviewerRowContext(event, trx, additionalReviewerId)
    if (!('row' in currentRowContext)) {
      return currentRowContext
    }
    await assertReviewNotLocked(
      event,
      currentRowContext.reviewRuntimeState,
      currentRowContext.reviewSetRuntimeState
    )

    const currentCommonUser = await resolveCurrentCommonUser(event, trx)
    if (!currentCommonUser || currentCommonUser.id !== currentRowContext.row.assignedUserId) {
      return await forbidden(event)
    }
    if (currentRowContext.row.completedAt) {
      return await badRequest(event, 'ADDITIONAL_REVIEWER_ALREADY_COMPLETED', 'apiErrors.request.invalid')
    }

    const allowedUsers = await listAllowedAdditionalReviewerUsers(event, trx, currentRowContext)
    if (!Array.isArray(allowedUsers)) {
      return allowedUsers
    }
    const assigneeError = body.egcs_cn_user === currentRowContext.row.assignedUserId
      ? null
      : await assertAdditionalReviewerAssigneeAllowed(event, allowedUsers, body.egcs_cn_user)
    if (assigneeError) {
      return assigneeError
    }

    const updated = await updateAdditionalReviewerRow(trx, additionalReviewerId, body)
    return mapAdditionalReviewerPatchResponse(
      updated,
      body,
      currentRowContext,
      allowedUsers,
      currentCommonUser.id
    )
  })
})
