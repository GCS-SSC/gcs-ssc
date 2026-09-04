import { TransferPaymentCostCategoryLineItemSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { authorizeTransferPaymentStreamCreateScope, resolveTransferPaymentStreamScopeContextForRoute } from '~~/server/utils/transfer-payment-stream-scope'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  const access = await authorizeTransferPaymentStreamResource(event, 'create', profileId, streamId)
  if (!access) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')

  const streamContext = await resolveTransferPaymentStreamScopeContextForRoute(event, profileId, streamId, db)
  if ('statusCode' in streamContext) return streamContext

  await authorize(event, 'transfer_payment', 'create', async ({ context }) => {
    return await authorizeTransferPaymentStreamCreateScope(streamContext.scope, db, context)
  })
  const validated = await readValidatedBodyI18n(event, TransferPaymentCostCategoryLineItemSchema)

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'create', async (trx, context) => {
      const lineItem = await trx.selectFrom('Agency_Cost_Category_Line_Item')
        .innerJoin('Agency_Cost_Category', 'Agency_Cost_Category.id', 'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory')
        .where('Agency_Cost_Category_Line_Item.id', '=', validated.egcs_tp_organizationcostcategory)
        .where('Agency_Cost_Category.egcs_ay_organizationagency', '=', context.agencyId)
        .where('Agency_Cost_Category_Line_Item._deleted', '=', false)
        .where('Agency_Cost_Category._deleted', '=', false).select('Agency_Cost_Category_Line_Item.id')
        .forUpdate('Agency_Cost_Category_Line_Item').executeTakeFirst()
      if (!lineItem) return await badRequest(event, 'TRANSFER_PAYMENT_COST_CATEGORY_INVALID', 'apiErrors.transfer_payment.invalid_cost_category_line_item')
      try {
        return await trx
          .insertInto('Transfer_Payment_Stream_Cost_Category_Line_Item')
          .values({
            egcs_tp_transferpaymentstream: streamId,
            egcs_tp_organizationcostcategory: validated.egcs_tp_organizationcostcategory,
            egcs_tp_costsharingratio: validated.egcs_tp_costsharingratio
          })
          .returningAll()
          .executeTakeFirstOrThrow()
      } catch (error) {
        return await throwIfTransferPaymentUniqueConstraintError(event, error)
      }
    }
  )
})
