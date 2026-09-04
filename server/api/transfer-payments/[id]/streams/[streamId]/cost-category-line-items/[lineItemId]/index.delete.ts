import type { Scope } from '~~/shared/utils/scopes'
import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentCostCategoryLineItemResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { assertTransferPaymentCostCategoryLineItemNotInUse } from '~~/server/utils/cost-configuration-integrity'

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
  const lineItemId = getRouterParam(event, 'lineItemId')
  if (!profileId || !streamId || !lineItemId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  const access = await authorizeTransferPaymentCostCategoryLineItemResource(event, 'delete', profileId, streamId, lineItemId)
  if (!access) return await notFound(event, 'TRANSFER_PAYMENT_COST_CATEGORY_LINE_ITEM_NOT_FOUND', 'apiErrors.transfer_payment.cost_category_line_item_not_found')

  const lineItem = await db
    .selectFrom('Transfer_Payment_Stream_Cost_Category_Line_Item')
    .innerJoin(
      'Transfer_Payment_Stream',
      'Transfer_Payment_Stream.id',
      'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_transferpaymentstream'
    )
    .innerJoin(
      'Transfer_Payment_Profile',
      'Transfer_Payment_Profile.id',
      'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
    )
    .where('Transfer_Payment_Stream_Cost_Category_Line_Item.id', '=', lineItemId)
    .where('Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_transferpaymentstream', '=', streamId)
    .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
    .where('Transfer_Payment_Stream_Cost_Category_Line_Item._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .select(['Transfer_Payment_Profile.egcs_tp_agency as agency_id'])
    .executeTakeFirst()

  if (!lineItem) {
    return await notFound(
      event,
      'TRANSFER_PAYMENT_COST_CATEGORY_LINE_ITEM_NOT_FOUND',
      'apiErrors.transfer_payment.cost_category_line_item_not_found'
    )
  }

  const scope: Scope = {
    type: 'entity',
    agencyId: String(lineItem.agency_id),
    path: [
      { type: 'transfer_payment', id: profileId },
      { type: 'transfer_payment_stream', id: streamId },
      { type: 'transfer_payment_cost_category_line_item', id: lineItemId }
    ]
  }

  await authorize(event, 'transfer_payment', 'delete', createTransferPaymentScopedAuthorizeHandler('delete', scope, db))

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, String(lineItem.agency_id), streamId, 'delete', async trx => {
      const lockedLineItem = await trx.selectFrom('Transfer_Payment_Stream_Cost_Category_Line_Item')
        .select('id').where('id', '=', lineItemId)
        .where('egcs_tp_transferpaymentstream', '=', streamId).where('_deleted', '=', false)
        .forUpdate().executeTakeFirst()
      if (!lockedLineItem) return await notFound(event, 'TRANSFER_PAYMENT_COST_CATEGORY_LINE_ITEM_NOT_FOUND', 'apiErrors.transfer_payment.cost_category_line_item_not_found')

      await assertTransferPaymentCostCategoryLineItemNotInUse(event, trx, lineItemId)

      const deleted = await trx.updateTable('Transfer_Payment_Stream_Cost_Category_Line_Item')
        .set({ _deleted: true }).where('id', '=', lineItemId)
        .where('egcs_tp_transferpaymentstream', '=', streamId).where('_deleted', '=', false)
        .returning('id').executeTakeFirst()
      if (!deleted) return await notFound(event, 'TRANSFER_PAYMENT_COST_CATEGORY_LINE_ITEM_NOT_FOUND', 'apiErrors.transfer_payment.cost_category_line_item_not_found')
      return { success: true }
    }
  )
})
