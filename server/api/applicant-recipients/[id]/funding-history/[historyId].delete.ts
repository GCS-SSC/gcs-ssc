import { authorize, authorizeWithFreshAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import { resolveApplicantRecipientAuthorization } from '~~/server/utils/applicant-recipient-auth'
import { isValidFundingHistoryId } from '~~/server/utils/funding-history-id'
import {
  assertFundingHistoryExistsForRecipient,
  assertFundingHistoryRecipientAccess
} from '~~/server/utils/funding-history'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const applicantRecipientId = getRouterParam(event, 'id')
  const historyId = getRouterParam(event, 'historyId')
  if (!isValidFundingHistoryId(applicantRecipientId) || !isValidFundingHistoryId(historyId)) return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  await authorize(event, 'applicant_recipient', 'delete', async ({ context }) =>
    await resolveApplicantRecipientAuthorization(context, applicantRecipientId, 'delete', db)
  )

  return await db.transaction().execute(async trx => {
    const context = await requireFreshAuthContext(event, trx)
    await assertFundingHistoryExistsForRecipient(event, historyId, applicantRecipientId, trx, true)
    await authorizeWithFreshAuthContext(event, context, 'applicant_recipient', 'delete', async () => {
      await assertFundingHistoryRecipientAccess(event, context, [applicantRecipientId], 'delete', trx)
      return { bypass: true }
    })
    return await trx
      .updateTable('Applicant_Recipient_Funding_History_Recipient')
      .set({ _deleted: true })
      .where('egcs_ar_fundinghistory', '=', historyId)
      .where('egcs_ar_applicantrecipient', '=', applicantRecipientId)
      .where('_deleted', '=', false)
      .returningAll()
      .executeTakeFirstOrThrow()
  })
})
