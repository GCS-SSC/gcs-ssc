import { badRequest, notFound } from '~~/server/utils/api-errors'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeReviewRuntimeAction } from '~~/server/utils/review-runtime-access'
import {
  reassignReviewApproval,
  resolveApprovalActionContext
} from '~~/server/utils/review-approval-runtime'
import { ReviewApprovalReassignSchema } from '~~/shared/types/schemas/review-approval'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const body = await readValidatedBodyI18n(event, ReviewApprovalReassignSchema)
  if (!body.approvalId) {
    return await badRequest(event, 'MISSING_REVIEW_APPROVAL_ID', 'apiErrors.request.missing_id')
  }

  const actionContext = await resolveApprovalActionContext(event.context.$db, body.approvalId)
  if (!actionContext) {
    return await notFound(event, 'REVIEW_APPROVAL_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  await authorizeReviewRuntimeAction(event, 'manage_review_approval', actionContext.runtimeEntity)

  return await reassignReviewApproval(event, body.approvalId, body)
})
