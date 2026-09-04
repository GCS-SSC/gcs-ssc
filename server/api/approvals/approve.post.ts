import { badRequest, notFound } from '~~/server/utils/api-errors'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import {
  authorizeReviewRuntimeAction,
  executeFreshAuthorizedApprovalActorWrite
} from '~~/server/utils/review-runtime-access'
import {
  approveReviewApproval,
  resolveApprovalActionContext
} from '~~/server/utils/review-approval-runtime'
import { ReviewApprovalApproveSchema } from '~~/shared/types/schemas/review-approval'
import { advanceWorkflowAfterApprovalForRequest } from '~~/server/utils/workflow-runtime'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const body = await readValidatedBodyI18n(event, ReviewApprovalApproveSchema)
  if (!body.approvalId) {
    return await badRequest(event, 'MISSING_REVIEW_APPROVAL_ID', 'apiErrors.request.missing_id')
  }

  const actionContext = await resolveApprovalActionContext(event.context.$db, body.approvalId)
  if (!actionContext) {
    return await notFound(event, 'REVIEW_APPROVAL_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  await authorizeReviewRuntimeAction(event, 'action_review_approval', actionContext.runtimeEntity)

  try {
    /**
     * Repairs a previously persisted approval whose workflow advancement did not commit.
     * @returns The repaired workflow projection.
     */
    const repairAdvancement = async () => await advanceWorkflowAfterApprovalForRequest(
      event,
      body.approvalId,
      async work => await executeFreshAuthorizedApprovalActorWrite(
        event,
        actionContext.runtimeEntity,
        async trx => await work(trx)
      )
    )
    try {
      const decision = await approveReviewApproval(event, body.approvalId, body)
      if (!['approved', 'denied'].includes(decision.approvalRuntimeState)) {
        await repairAdvancement()
      }
      return decision
    } catch (error: unknown) {
      // Advancement is idempotent. Running it even when a repeated decision is
      // rejected repairs a decision that committed before an earlier advancement
      // attempt failed.
      await repairAdvancement()
      throw error
    }
  } catch (error: unknown) {
    if (actionContext.runtimeEntity.entityType === 'fundingcaseamendment') {
      await throwIfAgreementUniqueConstraintError(event, error)
    }
    throw error
  }
})
