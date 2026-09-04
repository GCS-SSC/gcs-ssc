import { authorize } from '~~/server/utils/authorize'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import {
  assertTransferPaymentStreamSetupExists,
  isTransferPaymentStreamSetupPatchRouteContext,
  prepareTransferPaymentStreamSetupPatchRoute
} from '~~/server/utils/transfer-payment-stream-setup-routes'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { hasActiveChartOfAccountCommitmentLine } from '~~/server/utils/transfer-payment-chart-of-account'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const preliminaryProfileId = getRouterParam(event, 'id')
  const preliminaryStreamId = getRouterParam(event, 'streamId')
  if (preliminaryProfileId && preliminaryStreamId) {
    const access = await authorizeTransferPaymentStreamResource(event, 'delete', preliminaryProfileId, preliminaryStreamId)
    if (!access) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  const routeContext = await prepareTransferPaymentStreamSetupPatchRoute(event, db, { childParam: 'chartOfAccountId' })
  if (!isTransferPaymentStreamSetupPatchRouteContext(routeContext)) return routeContext

  await assertTransferPaymentStreamSetupExists(
    event,
    db.selectFrom('Transfer_Payment_Stream_Chart_of_Account')
      .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Stream_Chart_of_Account.egcs_tp_transferpaymentstream')
      .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
      .where('Transfer_Payment_Stream_Chart_of_Account.id', '=', routeContext.childId)
      .where('Transfer_Payment_Stream_Chart_of_Account.egcs_tp_transferpaymentstream', '=', routeContext.streamId)
      .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', routeContext.profileId)
      .where('Transfer_Payment_Stream_Chart_of_Account._deleted', '=', false)
      .where('Transfer_Payment_Stream._deleted', '=', false)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .select('Transfer_Payment_Stream_Chart_of_Account.id')
      .executeTakeFirst(),
    'CHART_OF_ACCOUNT_NOT_FOUND',
    'apiErrors.transfer_payment.chart_of_account_not_found'
  )

  await authorize(event, 'transfer_payment', 'delete', createTransferPaymentScopedAuthorizeHandler('delete', routeContext.streamContext.scope, db))

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event,
    db,
    routeContext.profileId,
    routeContext.streamContext.agencyId,
    routeContext.streamId,
    'delete',
    async trx => {
      await assertTransferPaymentStreamSetupExists(
        event,
        trx.selectFrom('Transfer_Payment_Stream_Chart_of_Account').select('id')
          .where('id', '=', routeContext.childId)
          .where('egcs_tp_transferpaymentstream', '=', routeContext.streamId)
          .where('_deleted', '=', false)
          .forUpdate()
          .executeTakeFirst(),
        'CHART_OF_ACCOUNT_NOT_FOUND',
        'apiErrors.transfer_payment.chart_of_account_not_found'
      )

      const inUse = await hasActiveChartOfAccountCommitmentLine(trx, routeContext.childId)
      if (inUse) {
        return await badRequest(
          event,
          'TRANSFER_PAYMENT_CHART_OF_ACCOUNT_IN_USE',
          'apiErrors.transfer_payment.chart_of_account_in_use'
        )
      }

      await trx.updateTable('Transfer_Payment_Stream_Chart_of_Account')
        .set({ _deleted: true })
        .where('id', '=', routeContext.childId)
        .where('egcs_tp_transferpaymentstream', '=', routeContext.streamId)
        .where('_deleted', '=', false)
        .execute()

      return { success: true }
    }
  )
})
