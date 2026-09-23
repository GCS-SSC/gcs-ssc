import { TransferPaymentStreamReviewSetupMemberPatchSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { patchTransferPaymentReviewSetupItem } from '~~/server/utils/transfer-payment-review-setup-item-routes'
import { throwIfReviewSetupMemberConstraintError } from '~~/server/utils/review-setup-member-constraint-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  const reviewSetupId = getRouterParam(event, 'reviewSetId') ?? ''
  const itemId = getRouterParam(event, 'itemId') ?? ''
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  if (!isPositivePostgresBigintText(reviewSetupId) || !isPositivePostgresBigintText(itemId)) {
    return await notFound(event, 'REVIEW_SETUP_MEMBER_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
  }
  const body = await readValidatedBodyI18n(event, TransferPaymentStreamReviewSetupMemberPatchSchema)
  try {
    return await withActiveAgencyMutationTransaction(event, agencyId, async trx =>
      await patchTransferPaymentReviewSetupItem(event, trx, { agencyId, reviewSetupId, itemId, body }))
  } catch (error: unknown) {
    return await throwIfReviewSetupMemberConstraintError(event, error)
  }
})
