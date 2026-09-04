import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import {
  authorizeTransferPaymentStreamAction,
  assertMutableAssessmentSet,
  fetchAssessmentSetForStream,
  fetchAssessmentSetItemForStream
} from '~~/server/utils/transfer-payment-assessment-sets'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

// Authorization is enforced by authorizeTransferPaymentStreamAction, which wraps authorize().
// eslint-disable-next-line local/require-authorize
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const assessmentSetId = getRouterParam(event, 'assessmentSetId')
  const itemId = getRouterParam(event, 'itemId')

  if (!profileId || !streamId || !assessmentSetId || !itemId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  if (!isPositivePostgresBigintText(assessmentSetId) || !isPositivePostgresBigintText(itemId)) {
    return await notFound(event, 'ASSESSMENT_SET_ITEM_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
  }

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'delete', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorizeTransferPaymentStreamAction(event, 'delete', streamContext, db)

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event,
    db,
    profileId,
    streamContext.agencyId,
    streamId,
    'delete',
    async trx => {
      await assertMutableAssessmentSet(event, trx, assessmentSetId)
      const parentSet = await fetchAssessmentSetForStream(trx, streamId, assessmentSetId)
      if (!parentSet) {
        return await notFound(event, 'ASSESSMENT_SET_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
      }

      const currentItem = await fetchAssessmentSetItemForStream(trx, streamId, assessmentSetId, itemId)
      if (!currentItem) {
        return await notFound(event, 'ASSESSMENT_SET_ITEM_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
      }

      await trx
        .updateTable('Common_Review_Setup')
        .set({ _deleted: true })
        .where('id', '=', itemId)
        .where('egcs_cn_reviewset', '=', assessmentSetId)
        .execute()

      return { success: true }
    }
  )
})
