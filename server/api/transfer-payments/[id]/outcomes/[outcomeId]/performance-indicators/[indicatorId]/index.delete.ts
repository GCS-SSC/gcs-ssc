import {
  executeFreshAuthorizedTransferPaymentOutcomeIndicatorWrite,
  isTransferPaymentOutcomeIndicatorRouteContext,
  prepareTransferPaymentOutcomeIndicatorRoute
} from '~~/server/utils/transfer-payment-outcome-routes'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const routeContext = await prepareTransferPaymentOutcomeIndicatorRoute(event, db, 'delete')
  if (!isTransferPaymentOutcomeIndicatorRouteContext(routeContext)) {
    return routeContext
  }

  return await executeFreshAuthorizedTransferPaymentOutcomeIndicatorWrite(
    event,
    'delete',
    routeContext,
    async trx => {
      await trx
        .updateTable('Transfer_Payment_Outcome_Performance_Indicator')
        .set({ _deleted: true })
        .where('id', '=', routeContext.indicatorId)
        .where('egcs_tp_transferpaymentoutcome', '=', routeContext.outcomeId)
        .where('_deleted', '=', false)
        .execute()
      return { success: true }
    }
  )
})
