import { TransferPaymentStreamReviewSetupPatchSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import {
  isTransferPaymentStreamSetupPatchRouteContext,
  prepareTransferPaymentStreamSetupPatchRoute
} from '~~/server/utils/transfer-payment-stream-setup-routes'
import { patchTransferPaymentReviewSetup } from '~~/server/utils/transfer-payment-review-setup-routes'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { throwIfReviewSetupMemberConstraintError } from '~~/server/utils/review-setup-member-constraint-errors'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const preliminaryProfileId = getRouterParam(event, 'id')
  const preliminaryStreamId = getRouterParam(event, 'streamId')
  if (preliminaryProfileId && preliminaryStreamId) {
    const access = await authorizeTransferPaymentStreamResource(event, 'update', preliminaryProfileId, preliminaryStreamId)
    if (!access) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }
  const routeContext = await prepareTransferPaymentStreamSetupPatchRoute(event, db, {
    childParam: 'reviewSetupId'
  })
  if (!isTransferPaymentStreamSetupPatchRouteContext(routeContext)) {
    return routeContext
  }

  const { profileId, streamId, childId: reviewSetupId, streamContext } = routeContext
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', streamContext.scope, db))

  const body = await readValidatedBodyI18n(event, TransferPaymentStreamReviewSetupPatchSchema)

  try {
    return await executeFreshAuthorizedTransferPaymentStreamWrite(
      event, db, profileId, streamContext.agencyId, streamId, 'update',
      async (trx, freshContext) => await patchTransferPaymentReviewSetup(event, trx, {
        agencyId: freshContext.agencyId, streamId, reviewSetupId, body
      })
    )
  } catch (error: unknown) {
    return await throwIfReviewSetupMemberConstraintError(event, error)
  }
})
