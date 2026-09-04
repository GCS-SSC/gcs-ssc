import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import {
  authorizeTransferPaymentStreamAction,
  assertMutableAssessmentSet,
  fetchAssessmentSetForStream
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

  if (!profileId || !streamId || !assessmentSetId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  if (!isPositivePostgresBigintText(assessmentSetId)) {
    return await notFound(event, 'ASSESSMENT_SET_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
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
      const currentSet = await fetchAssessmentSetForStream(trx, streamId, assessmentSetId)
      if (!currentSet) {
        return await notFound(event, 'ASSESSMENT_SET_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
      }

      await trx
        .updateTable('Common_Review_Set_Setup')
        .set({ _deleted: true })
        .where('id', '=', assessmentSetId)
        .execute()

      await trx
        .updateTable('Common_Review_Setup')
        .set({ _deleted: true })
        .where('egcs_cn_reviewset', '=', assessmentSetId)
        .where('_deleted', '=', false)
        .execute()

      return { success: true }
    }
  )
})
