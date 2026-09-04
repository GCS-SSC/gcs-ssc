import { TransferPaymentStreamRecommendationSetupPatchSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import {
  isTransferPaymentStreamSetupPatchRouteContext,
  prepareTransferPaymentStreamSetupPatchRoute
} from '~~/server/utils/transfer-payment-stream-setup-routes'
import { patchTransferPaymentRecommendationSetup } from '~~/server/utils/transfer-payment-recommendation-setup-routes'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const preliminaryProfileId = getRouterParam(event, 'id')
  const preliminaryStreamId = getRouterParam(event, 'streamId')
  const preliminaryRecommendationSetupId = getRouterParam(event, 'recommendationSetupId')
  if (preliminaryRecommendationSetupId && !isPositivePostgresBigintText(preliminaryRecommendationSetupId)) {
    return await notFound(event, 'RECOMMENDATION_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_setup_not_found')
  }
  if (preliminaryProfileId && preliminaryStreamId) {
    const access = await authorizeTransferPaymentStreamResource(event, 'update', preliminaryProfileId, preliminaryStreamId)
    if (!access) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }
  const routeContext = await prepareTransferPaymentStreamSetupPatchRoute(event, db, {
    childParam: 'recommendationSetupId'
  })
  if (!isTransferPaymentStreamSetupPatchRouteContext(routeContext)) {
    return routeContext
  }

  const { profileId, streamId, childId: recommendationSetupId, streamContext } = routeContext
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', streamContext.scope, db))

  const body = await readValidatedBodyI18n(event, TransferPaymentStreamRecommendationSetupPatchSchema)

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'update',
    async (trx, freshContext) => await patchTransferPaymentRecommendationSetup(event, trx, {
      agencyId: freshContext.agencyId,
      streamId,
      recommendationSetupId,
      body
    })
  )
})
