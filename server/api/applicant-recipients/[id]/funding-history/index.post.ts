import { sql } from 'kysely'
import { FundingHistoryExternalCreateSchema } from '~~/shared/types/schemas'
import { authorize, authorizeWithFreshAuthContext, requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import {
  lockActiveApplicantRecipientIds,
  resolveApplicantRecipientAuthorization
} from '~~/server/utils/applicant-recipient-auth'
import {
  assertFundingHistoryRecipientAccess,
  assertNoExactFundingHistoryConflicts,
  collectFundingHistorySimilarityWarnings,
  requireFundingHistorySimilarityConfirmation
} from '~~/server/utils/funding-history'
import { throwIfFundingHistoryConstraintError } from '~~/server/utils/funding-history-constraint-errors'
import { isValidFundingHistoryId } from '~~/server/utils/funding-history-id'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const applicantRecipientId = getRouterParam(event, 'id')
  if (!isValidFundingHistoryId(applicantRecipientId)) return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  const validated = await readValidatedBodyI18n(event, FundingHistoryExternalCreateSchema)
  if (!validated.recipientIds.includes(applicantRecipientId)) {
    return await badRequest(event, 'FUNDING_HISTORY_CURRENT_RECIPIENT_REQUIRED', 'apiErrors.funding_history.current_recipient_required')
  }

  await authorize(event, 'applicant_recipient', 'create', async ({ context }) =>
    await resolveApplicantRecipientAuthorization(context, applicantRecipientId, 'create', db)
  )

  try {
    return await db.transaction().execute(async trx => {
      const context = await requireFreshAuthContext(event, trx)
      const recipientIds = validated.recipientIds.map(String).sort()
      if (!await lockActiveApplicantRecipientIds(trx, recipientIds)) {
        return await badRequest(event, 'INVALID_FUNDING_HISTORY_RECIPIENT', 'apiErrors.funding_history.invalid_recipient')
      }
      await authorizeWithFreshAuthContext(event, context, 'applicant_recipient', 'create', async () => {
        await assertFundingHistoryRecipientAccess(event, context, recipientIds, 'create', trx)
        return { bypass: true }
      })
      await assertNoExactFundingHistoryConflicts(event, validated, trx)
      const warnings = await collectFundingHistorySimilarityWarnings(context, validated, trx)
      await requireFundingHistorySimilarityConfirmation(event, warnings, validated.confirmations)

      const historyValues = {
        egcs_ar_agencyname_en: validated.egcs_ar_agencyname_en,
        egcs_ar_agencyname_fr: validated.egcs_ar_agencyname_fr,
        egcs_ar_programname_en: validated.egcs_ar_programname_en,
        egcs_ar_programname_fr: validated.egcs_ar_programname_fr,
        egcs_ar_agreementnumber: validated.egcs_ar_agreementnumber,
        egcs_ar_title_en: validated.egcs_ar_title_en,
        egcs_ar_title_fr: validated.egcs_ar_title_fr,
        egcs_ar_description_en: validated.egcs_ar_description_en,
        egcs_ar_description_fr: validated.egcs_ar_description_fr,
        egcs_ar_startdate: validated.egcs_ar_startdate,
        egcs_ar_enddate: validated.egcs_ar_enddate,
        egcs_ar_fundingamount: databaseMoneyValue(validated.egcs_ar_fundingamount),
        egcs_ar_currency: validated.egcs_ar_currency
      }
      const history = await trx
        .insertInto('Applicant_Recipient_Funding_History')
        .values(historyValues)
        .returning([
          'id',
          'egcs_ar_agencyname_en',
          'egcs_ar_agencyname_fr',
          'egcs_ar_programname_en',
          'egcs_ar_programname_fr',
          'egcs_ar_agreementnumber',
          'egcs_ar_title_en',
          'egcs_ar_title_fr',
          'egcs_ar_description_en',
          'egcs_ar_description_fr',
          'egcs_ar_startdate',
          'egcs_ar_enddate',
          databaseMoneyText(sql.ref('egcs_ar_fundingamount')).as('egcs_ar_fundingamount'),
          'egcs_ar_currency',
          '_deleted'
        ])
        .executeTakeFirstOrThrow()
      await trx
        .insertInto('Applicant_Recipient_Funding_History_Recipient')
        .values(recipientIds.map(recipientId => ({
          egcs_ar_fundinghistory: history.id,
          egcs_ar_applicantrecipient: recipientId
        })))
        .execute()
      return { ...history, egcs_ar_fundingamount: parseDatabaseMoney(history.egcs_ar_fundingamount), recipientIds }
    })
  } catch (error: unknown) {
    await throwIfFundingHistoryConstraintError(event, error)
    throw error
  }
})
