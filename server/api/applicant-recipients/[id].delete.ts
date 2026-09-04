import { authorize } from '~~/server/utils/authorize'
import { badRequest, notFound, throwApiError } from '~~/server/utils/api-errors'
import {
  executeFreshAuthorizedApplicantRecipientWrite,
  resolveApplicantRecipientAuthorization
} from '~~/server/utils/applicant-recipient-auth'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const id = getRouterParam(event, 'id')
  if (!id) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  await authorize(event, 'applicant_recipient', 'delete', async ({ context }) =>
    await resolveApplicantRecipientAuthorization(context, id, 'delete', db))
  return await executeFreshAuthorizedApplicantRecipientWrite(event, db, id, 'delete', async trx => {
    const activeAgreementLink = await trx
      .selectFrom('Funding_Case_Agreement_Applicant_Recipient')
      .innerJoin(
        'Funding_Case_Agreement_Profile',
        'Funding_Case_Agreement_Profile.id',
        'Funding_Case_Agreement_Applicant_Recipient.egcs_fc_fundingagreement'
      )
      .select('Funding_Case_Agreement_Applicant_Recipient.id as id')
      .where('Funding_Case_Agreement_Applicant_Recipient.egcs_fc_applicantrecipient', '=', id)
      .where('Funding_Case_Agreement_Applicant_Recipient._deleted', '=', false)
      .where('Funding_Case_Agreement_Profile._deleted', '=', false)
      .forUpdate('Funding_Case_Agreement_Applicant_Recipient')
      .executeTakeFirst()
    const activeFundingHistoryLink = await trx
      .selectFrom('Applicant_Recipient_Funding_History_Recipient')
      .innerJoin(
        'Applicant_Recipient_Funding_History',
        'Applicant_Recipient_Funding_History.id',
        'Applicant_Recipient_Funding_History_Recipient.egcs_ar_fundinghistory'
      )
      .select('Applicant_Recipient_Funding_History_Recipient.id as id')
      .where('Applicant_Recipient_Funding_History_Recipient.egcs_ar_applicantrecipient', '=', id)
      .where('Applicant_Recipient_Funding_History_Recipient._deleted', '=', false)
      .where('Applicant_Recipient_Funding_History._deleted', '=', false)
      .forUpdate('Applicant_Recipient_Funding_History_Recipient')
      .executeTakeFirst()
    if (activeAgreementLink || activeFundingHistoryLink) {
      return await throwApiError(event, {
        statusCode: 409,
        code: 'APPLICANT_RECIPIENT_PROFILE_IN_USE',
        key: 'apiErrors.applicant_recipient.profile_in_use'
      })
    }

    const deleted = await trx
      .updateTable('Applicant_Recipient_Profile')
      .set({ _deleted: true })
      .where('id', '=', id)
      .where('_deleted', '=', false)
      .returning('id')
      .executeTakeFirst()
    if (!deleted) {
      return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
    }
    return { success: true }
  })
})
