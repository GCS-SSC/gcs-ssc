import { TransferPaymentStreamReviewSetupPatchSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { patchTransferPaymentReviewSetup } from '~~/server/utils/transfer-payment-review-setup-routes'
import { throwIfReviewSetupMemberConstraintError } from '~~/server/utils/review-setup-member-constraint-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  const reviewSetupId = getRouterParam(event, 'reviewSetId') ?? ''
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  if (!isPositivePostgresBigintText(reviewSetupId)) return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
  const body = await readValidatedBodyI18n(event, TransferPaymentStreamReviewSetupPatchSchema)
  try {
    return await withActiveAgencyMutationTransaction(event, agencyId, async trx =>
      await patchTransferPaymentReviewSetup(event, trx, { agencyId, reviewSetupId, body }))
  } catch (error: unknown) {
    return await throwIfReviewSetupMemberConstraintError(event, error)
  }
})
