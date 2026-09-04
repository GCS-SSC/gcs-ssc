import { authorize, authorizeWithFreshAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import { resolveApplicantRecipientAuthorization } from '~~/server/utils/applicant-recipient-auth'
import { isValidFundingHistoryId } from '~~/server/utils/funding-history-id'
import {
  assertFundingHistoryExistsForRecipient,
  assertFundingHistoryRecipientAccess,
  listFundingHistoryRecipientIds
} from '~~/server/utils/funding-history'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const applicantRecipientId = getRouterParam(event, 'id')
  const historyId = getRouterParam(event, 'historyId')
  const recipientId = getRouterParam(event, 'recipientId')
  if (!isValidFundingHistoryId(applicantRecipientId) || !isValidFundingHistoryId(historyId) || !isValidFundingHistoryId(recipientId)) {
    return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  }
  await authorize(event, 'applicant_recipient', 'update', async ({ context }) =>
    await resolveApplicantRecipientAuthorization(context, applicantRecipientId, 'update', db)
  )

  return await db.transaction().execute(async trx => {
    const context = await requireFreshAuthContext(event, trx)
    await assertFundingHistoryExistsForRecipient(event, historyId, applicantRecipientId, trx, true)
    const currentRecipientIds = await listFundingHistoryRecipientIds(historyId, trx)
    await authorizeWithFreshAuthContext(event, context, 'applicant_recipient', 'update', async () => {
      await assertFundingHistoryRecipientAccess(event, context, currentRecipientIds, 'update', trx)
      return { bypass: true }
    })
    await assertFundingHistoryExistsForRecipient(event, historyId, recipientId, trx, true)
    await authorizeWithFreshAuthContext(event, context, 'applicant_recipient', 'delete', async () => {
      await assertFundingHistoryRecipientAccess(event, context, [recipientId], 'delete', trx)
      return { bypass: true }
    })
    return await trx
      .updateTable('Applicant_Recipient_Funding_History_Recipient')
      .set({ _deleted: true })
      .where('egcs_ar_fundinghistory', '=', historyId)
      .where('egcs_ar_applicantrecipient', '=', recipientId)
      .where('_deleted', '=', false)
      .returningAll()
      .executeTakeFirstOrThrow()
  })
})
