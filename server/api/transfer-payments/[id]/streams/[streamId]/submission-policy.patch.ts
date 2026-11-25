import { defineEventHandler, getRouterParam } from 'h3'
import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { StreamSubmissionPolicyPatchSchema, effectiveStreamSubmissionPolicy } from '~~/shared/types/schemas/stream-submission-policy'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

// eslint-disable-next-line local/require-authorize -- The Stream authorization helper checks the owning Program.
export default defineEventHandler(async event => {
  const profileId = getRouterParam(event, 'id') ?? ''
  const streamId = getRouterParam(event, 'streamId') ?? ''
  if (!isPositivePostgresBigintText(profileId) || !isPositivePostgresBigintText(streamId)) {
    return await notFound(event, 'STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }
  const context = await authorizeTransferPaymentStreamResource(event, 'delete', profileId, streamId)
  if (!context) return await notFound(event, 'STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  const updates = await readValidatedBodyI18n(event, StreamSubmissionPolicyPatchSchema)
  return await executeFreshAuthorizedTransferPaymentStreamWrite(event, event.context.$db, profileId, context.agencyId, streamId, 'delete', async trx => {
    const stream = await trx.selectFrom('Transfer_Payment_Stream').select('egcs_tp_submissionpolicy')
      .where('id', '=', streamId).executeTakeFirstOrThrow()
    const policy = { ...stream.egcs_tp_submissionpolicy, ...updates }
    await trx.updateTable('Transfer_Payment_Stream').set({ egcs_tp_submissionpolicy: policy })
      .where('id', '=', streamId).executeTakeFirstOrThrow()
    return effectiveStreamSubmissionPolicy(policy)
  })
})
