import { z } from 'zod'
import { authorize, authorizeWithFreshAuthContext, requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import {
  lockActiveApplicantRecipientIds,
  resolveApplicantRecipientAuthorization
} from '~~/server/utils/applicant-recipient-auth'
import {
  assertFundingHistoryExistsForRecipient,
  assertFundingHistoryRecipientAccess,
  listFundingHistoryRecipientIds
} from '~~/server/utils/funding-history'
import { throwIfFundingHistoryConstraintError } from '~~/server/utils/funding-history-constraint-errors'
import { isValidFundingHistoryId } from '~~/server/utils/funding-history-id'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const BodySchema = z.object({
  applicantRecipientId: z.union([z.string(), z.number()]).transform(String)
    .refine(isPositivePostgresBigintText, { error: 'validation.invalid_selection' })
})

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const applicantRecipientId = getRouterParam(event, 'id')
  const historyId = getRouterParam(event, 'historyId')
  if (!isValidFundingHistoryId(applicantRecipientId) || !isValidFundingHistoryId(historyId)) return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  const body = await readValidatedBodyI18n(event, BodySchema)
  await authorize(event, 'applicant_recipient', 'update', async ({ context }) =>
    await resolveApplicantRecipientAuthorization(context, applicantRecipientId, 'update', db)
  )

  try {
    return await db.transaction().execute(async trx => {
      const context = await requireFreshAuthContext(event, trx)
      await assertFundingHistoryExistsForRecipient(event, historyId, applicantRecipientId, trx, true)
      const currentRecipientIds = await listFundingHistoryRecipientIds(historyId, trx)
      await authorizeWithFreshAuthContext(event, context, 'applicant_recipient', 'update', async () => {
        await assertFundingHistoryRecipientAccess(event, context, currentRecipientIds, 'update', trx)
        return { bypass: true }
      })
      if (!await lockActiveApplicantRecipientIds(trx, [body.applicantRecipientId])) {
        return await badRequest(event, 'INVALID_FUNDING_HISTORY_RECIPIENT', 'apiErrors.funding_history.invalid_recipient')
      }
      await assertFundingHistoryRecipientAccess(event, context, [body.applicantRecipientId], 'create', trx)
      return await trx
        .insertInto('Applicant_Recipient_Funding_History_Recipient')
        .values({
          egcs_ar_fundinghistory: historyId,
          egcs_ar_applicantrecipient: body.applicantRecipientId
        })
        .returningAll()
        .executeTakeFirstOrThrow()
    })
  } catch (error: unknown) {
    await throwIfFundingHistoryConstraintError(event, error)
    throw error
  }
})
