import { defineEventHandler, getRouterParam } from 'h3'
import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamRead } from '~~/server/utils/transfer-payment-write-transaction'
import { effectiveStreamSubmissionPolicy } from '~~/shared/types/schemas/stream-submission-policy'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

// eslint-disable-next-line local/require-authorize -- The Stream authorization helper checks the owning Program.
export default defineEventHandler(async event => {
  const profileId = getRouterParam(event, 'id') ?? ''
  const streamId = getRouterParam(event, 'streamId') ?? ''
  if (!isPositivePostgresBigintText(profileId) || !isPositivePostgresBigintText(streamId)) {
    return await notFound(event, 'STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }
  const context = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
  if (!context) return await notFound(event, 'STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  return await executeFreshAuthorizedTransferPaymentStreamRead(event, event.context.$db, profileId, context.agencyId, streamId, async trx => {
    const stream = await trx.selectFrom('Transfer_Payment_Stream').select('egcs_tp_submissionpolicy')
      .where('id', '=', streamId).executeTakeFirstOrThrow()
    return effectiveStreamSubmissionPolicy(stream.egcs_tp_submissionpolicy)
  })
})
