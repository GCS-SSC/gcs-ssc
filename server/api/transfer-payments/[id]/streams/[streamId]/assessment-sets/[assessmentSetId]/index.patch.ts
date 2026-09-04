import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import {
  authorizeTransferPaymentStreamAction,
  patchAssessmentSetForStream
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

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorizeTransferPaymentStreamAction(event, 'update', streamContext, db)

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event,
    db,
    profileId,
    streamContext.agencyId,
    streamId,
    'update',
    async trx => await patchAssessmentSetForStream(event, trx, streamId, assessmentSetId)
  )
})
