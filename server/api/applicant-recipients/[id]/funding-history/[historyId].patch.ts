import { sql } from 'kysely'
import { FundingHistoryExternalPatchSchema } from '~~/shared/types/schemas'
import { authorize, authorizeWithFreshAuthContext, requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import {
  lockActiveApplicantRecipientIds,
  resolveApplicantRecipientAuthorization
} from '~~/server/utils/applicant-recipient-auth'
import {
  assertFundingHistoryExistsForRecipient,
  assertFundingHistoryRecipientAccess,
  assertNoExactFundingHistoryConflicts,
  collectFundingHistorySimilarityWarnings,
  listFundingHistoryRecipientIds,
  requireFundingHistorySimilarityConfirmation
} from '~~/server/utils/funding-history'
import { throwIfFundingHistoryConstraintError } from '~~/server/utils/funding-history-constraint-errors'
import { isValidFundingHistoryId } from '~~/server/utils/funding-history-id'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'

const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key)

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const applicantRecipientId = getRouterParam(event, 'id')
  const historyId = getRouterParam(event, 'historyId')
  if (!isValidFundingHistoryId(applicantRecipientId) || !isValidFundingHistoryId(historyId)) return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  const validated = await readValidatedBodyI18n(event, FundingHistoryExternalPatchSchema)
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

      const currentHistory = await trx
        .selectFrom('Applicant_Recipient_Funding_History')
        .where('id', '=', historyId)
        .where('_deleted', '=', false)
        .select([
          'id',
          'egcs_ar_agencyname_en',
          'egcs_ar_agencyname_fr',
          'egcs_ar_programname_en',
          'egcs_ar_programname_fr',
          'egcs_ar_agreementnumber'
        ])
        .forUpdate()
        .executeTakeFirstOrThrow()
      const identityChanged = [
        'egcs_ar_agencyname_en',
        'egcs_ar_agencyname_fr',
        'egcs_ar_programname_en',
        'egcs_ar_programname_fr',
        'egcs_ar_agreementnumber'
      ].some(key => hasOwn(validated, key))
      const mergedIdentity = {
        egcs_ar_agencyname_en: hasOwn(validated, 'egcs_ar_agencyname_en')
          ? validated.egcs_ar_agencyname_en
          : currentHistory.egcs_ar_agencyname_en || undefined,
        egcs_ar_agencyname_fr: hasOwn(validated, 'egcs_ar_agencyname_fr')
          ? validated.egcs_ar_agencyname_fr
          : currentHistory.egcs_ar_agencyname_fr || undefined,
        egcs_ar_programname_en: hasOwn(validated, 'egcs_ar_programname_en')
          ? validated.egcs_ar_programname_en
          : currentHistory.egcs_ar_programname_en || undefined,
        egcs_ar_programname_fr: hasOwn(validated, 'egcs_ar_programname_fr')
          ? validated.egcs_ar_programname_fr
          : currentHistory.egcs_ar_programname_fr || undefined,
        egcs_ar_agreementnumber: hasOwn(validated, 'egcs_ar_agreementnumber')
          ? validated.egcs_ar_agreementnumber
          : currentHistory.egcs_ar_agreementnumber
      }
      if (identityChanged) {
        await assertNoExactFundingHistoryConflicts(event, mergedIdentity, trx, historyId)
        const warnings = await collectFundingHistorySimilarityWarnings(
          context,
          mergedIdentity,
          trx,
          { excludeHistoryId: historyId }
        )
        await requireFundingHistorySimilarityConfirmation(event, warnings, validated.confirmations || [])
      }

      if (Array.isArray(validated.recipientIds)) {
        const requestedRecipientIds = validated.recipientIds.map(String).sort()
        if (!requestedRecipientIds.includes(applicantRecipientId)) {
          return await badRequest(event, 'FUNDING_HISTORY_CURRENT_RECIPIENT_REQUIRED', 'apiErrors.funding_history.current_recipient_required')
        }
        if (!await lockActiveApplicantRecipientIds(trx, requestedRecipientIds)) {
          return await badRequest(event, 'INVALID_FUNDING_HISTORY_RECIPIENT', 'apiErrors.funding_history.invalid_recipient')
        }
        const additions = requestedRecipientIds.filter(id => !currentRecipientIds.includes(id))
        const removals = currentRecipientIds.filter(id => !requestedRecipientIds.includes(id))
        await assertFundingHistoryRecipientAccess(event, context, additions, 'create', trx)
        await assertFundingHistoryRecipientAccess(event, context, removals, 'delete', trx)
        if (removals.length > 0) {
          await trx
            .updateTable('Applicant_Recipient_Funding_History_Recipient')
            .set({ _deleted: true })
            .where('egcs_ar_fundinghistory', '=', historyId)
            .where('egcs_ar_applicantrecipient', 'in', removals)
            .where('_deleted', '=', false)
            .execute()
        }
        if (additions.length > 0) {
          await trx.insertInto('Applicant_Recipient_Funding_History_Recipient').values(additions.map(recipientId => ({
            egcs_ar_fundinghistory: historyId,
            egcs_ar_applicantrecipient: recipientId
          }))).execute()
        }
      }

      const detailValues = {
        ...(hasOwn(validated, 'egcs_ar_agencyname_en') ? { egcs_ar_agencyname_en: validated.egcs_ar_agencyname_en } : {}),
        ...(hasOwn(validated, 'egcs_ar_agencyname_fr') ? { egcs_ar_agencyname_fr: validated.egcs_ar_agencyname_fr } : {}),
        ...(hasOwn(validated, 'egcs_ar_programname_en') ? { egcs_ar_programname_en: validated.egcs_ar_programname_en } : {}),
        ...(hasOwn(validated, 'egcs_ar_programname_fr') ? { egcs_ar_programname_fr: validated.egcs_ar_programname_fr } : {}),
        ...(hasOwn(validated, 'egcs_ar_agreementnumber') ? { egcs_ar_agreementnumber: validated.egcs_ar_agreementnumber } : {}),
        ...(hasOwn(validated, 'egcs_ar_title_en') ? { egcs_ar_title_en: validated.egcs_ar_title_en } : {}),
        ...(hasOwn(validated, 'egcs_ar_title_fr') ? { egcs_ar_title_fr: validated.egcs_ar_title_fr } : {}),
        ...(hasOwn(validated, 'egcs_ar_description_en') ? { egcs_ar_description_en: validated.egcs_ar_description_en } : {}),
        ...(hasOwn(validated, 'egcs_ar_description_fr') ? { egcs_ar_description_fr: validated.egcs_ar_description_fr } : {}),
        ...(hasOwn(validated, 'egcs_ar_startdate') ? { egcs_ar_startdate: validated.egcs_ar_startdate } : {}),
        ...(hasOwn(validated, 'egcs_ar_enddate') ? { egcs_ar_enddate: validated.egcs_ar_enddate } : {}),
        ...(hasOwn(validated, 'egcs_ar_fundingamount') && validated.egcs_ar_fundingamount !== undefined
          ? { egcs_ar_fundingamount: databaseMoneyValue(validated.egcs_ar_fundingamount) }
          : {}),
        ...(hasOwn(validated, 'egcs_ar_currency') ? { egcs_ar_currency: validated.egcs_ar_currency } : {})
      }
      const updated = Object.keys(detailValues).length === 0
        ? await trx.selectFrom('Applicant_Recipient_Funding_History')
            .where('id', '=', historyId)
            .select([
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
              databaseMoneyText(sql.ref('egcs_ar_fundingamount')).as('exactFundingAmount'),
              'egcs_ar_currency',
              '_deleted'
            ])
            .executeTakeFirstOrThrow()
        : await trx.updateTable('Applicant_Recipient_Funding_History')
            .set(detailValues)
            .where('id', '=', historyId)
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
              databaseMoneyText(sql.ref('egcs_ar_fundingamount')).as('exactFundingAmount'),
              'egcs_ar_currency',
              '_deleted'
            ])
            .executeTakeFirstOrThrow()
      const { exactFundingAmount, ...updatedValues } = updated
      return { ...updatedValues, egcs_ar_fundingamount: parseDatabaseMoney(exactFundingAmount) }
    })
  } catch (error: unknown) {
    await throwIfFundingHistoryConstraintError(event, error)
    throw error
  }
})
