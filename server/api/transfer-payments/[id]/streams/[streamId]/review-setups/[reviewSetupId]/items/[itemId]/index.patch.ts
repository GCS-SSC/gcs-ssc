import { TransferPaymentStreamReviewSetupMemberPatchSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { patchTransferPaymentReviewSetupItem } from '~~/server/utils/transfer-payment-review-setup-item-routes'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { throwIfReviewSetupMemberConstraintError } from '~~/server/utils/review-setup-member-constraint-errors'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const reviewSetupId = getRouterParam(event, 'reviewSetupId')
  const itemId = getRouterParam(event, 'itemId')

  if (!profileId || !streamId || !reviewSetupId || !itemId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  if (!isPositivePostgresBigintText(reviewSetupId) || !isPositivePostgresBigintText(itemId)) {
    return await notFound(event, 'REVIEW_SETUP_MEMBER_NOT_FOUND', 'apiErrors.review.review_set_setup_not_found')
  }

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', streamContext.scope, db))

  const body = await readValidatedBodyI18n(event, TransferPaymentStreamReviewSetupMemberPatchSchema)
  try {
    return await executeFreshAuthorizedTransferPaymentStreamWrite(
      event, db, profileId, streamContext.agencyId, streamId, 'update',
      async (trx, freshContext) => await patchTransferPaymentReviewSetupItem(event, trx, {
        agencyId: freshContext.agencyId, streamId, reviewSetupId, itemId, body
      })
    )
  } catch (error: unknown) {
    return await throwIfReviewSetupMemberConstraintError(event, error)
  }
})
