import { TransferPaymentPerformanceIndicatorSchema } from '~~/shared/types/schemas'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { badRequest } from '~~/server/utils/api-errors'
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
  const routeContext = await prepareTransferPaymentOutcomeIndicatorRoute(event, db, 'update')
  if (!isTransferPaymentOutcomeIndicatorRouteContext(routeContext)) {
    return routeContext
  }

  const validated = await readValidatedBodyI18n(event, TransferPaymentPerformanceIndicatorSchema.partial())
  if (Object.keys(validated).length === 0) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }
  try {
    return await executeFreshAuthorizedTransferPaymentOutcomeIndicatorWrite(
      event,
      'update',
      routeContext,
      async trx => await trx
        .updateTable('Transfer_Payment_Outcome_Performance_Indicator')
        .set(validated)
        .where('id', '=', routeContext.indicatorId)
        .where('egcs_tp_transferpaymentoutcome', '=', routeContext.outcomeId)
        .where('_deleted', '=', false)
        .returningAll()
        .executeTakeFirstOrThrow()
    )
  } catch (error) {
    return await throwIfTransferPaymentUniqueConstraintError(event, error)
  }
})
