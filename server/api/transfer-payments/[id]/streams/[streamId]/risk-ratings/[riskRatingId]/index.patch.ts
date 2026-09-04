import { TransferPaymentStreamRiskRatingSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import {
  assertTransferPaymentStreamSetupExists,
  executeTransferPaymentStreamSetupUpdate,
  isTransferPaymentStreamSetupPatchRouteContext,
  prepareTransferPaymentStreamSetupPatchRoute,
  readTransferPaymentStreamSetupPatchBody
} from '~~/server/utils/transfer-payment-stream-setup-routes'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { isRiskRatingPinned } from '~~/server/utils/agreement-risk-rating'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const preliminaryStreamId = getRouterParam(event, 'streamId')
  const preliminaryRiskRatingId = getRouterParam(event, 'riskRatingId')
  if (preliminaryRiskRatingId && !isPositivePostgresBigintText(preliminaryRiskRatingId)) {
    return await notFound(event, 'RISK_RATING_NOT_FOUND', 'apiErrors.transfer_payment.risk_rating_not_found')
  }
  if (profileId && preliminaryStreamId) {
    const access = await authorizeTransferPaymentStreamResource(event, 'update', profileId, preliminaryStreamId)
    if (!access) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }
  const routeContext = await prepareTransferPaymentStreamSetupPatchRoute(event, db, {
    childParam: 'riskRatingId'
  })
  if (!isTransferPaymentStreamSetupPatchRouteContext(routeContext)) {
    return routeContext
  }

  const { streamId, childId: riskRatingId, streamContext } = routeContext
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', streamContext.scope, db))

  await assertTransferPaymentStreamSetupExists(
    event,
    db
      .selectFrom('Transfer_Payment_Stream_Risk_Rating')
      .where('id', '=', riskRatingId)
      .where('egcs_tp_transferpaymentstream', '=', streamId)
      .where('_deleted', '=', false)
      .select('id')
      .executeTakeFirst(),
    'RISK_RATING_NOT_FOUND',
    'apiErrors.transfer_payment.risk_rating_not_found'
  )

  const payload = await readTransferPaymentStreamSetupPatchBody(
    event,
    TransferPaymentStreamRiskRatingSchema.omit({ egcs_tp_transferpaymentstream: true }).partial()
  )

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, routeContext.profileId, streamContext.agencyId, streamId, 'update', async trx => {
      await assertTransferPaymentStreamSetupExists(
        event,
        trx.selectFrom('Transfer_Payment_Stream_Risk_Rating').select('id').where('id', '=', riskRatingId)
          .where('egcs_tp_transferpaymentstream', '=', streamId).where('_deleted', '=', false)
          .forUpdate().executeTakeFirst(),
        'RISK_RATING_NOT_FOUND', 'apiErrors.transfer_payment.risk_rating_not_found'
      )
      if (Object.hasOwn(payload, 'egcs_tp_riskscore') && await isRiskRatingPinned(trx, streamId, riskRatingId)) {
        return await badRequest(event, 'RISK_RATING_WORKFLOW_REFERENCED', 'apiErrors.transfer_payment.risk_rating_workflow_referenced')
      }
      return await executeTransferPaymentStreamSetupUpdate(event, trx
        .updateTable('Transfer_Payment_Stream_Risk_Rating')
        .set(payload)
        .where('id', '=', riskRatingId)
        .where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false)
        .returningAll()
        .executeTakeFirstOrThrow())
    }
  )
})
