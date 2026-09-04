import type { Insertable } from 'kysely'
import { authorize } from '~~/server/utils/authorize'
import { ApplicantRecipientAgencyFinancialIdCreateSchema } from '~~/shared/types/schemas'
import type { ApplicantRecipientAgencyFinancialIdTable } from '~~/shared/types/database'
import { badRequest } from '~~/server/utils/api-errors'
import { throwIfApplicantRecipientUniqueConstraintError } from '~~/server/utils/applicant-recipient-unique-constraint-errors'
import {
  executeFreshAuthorizedApplicantRecipientWrite,
  resolveApplicantRecipientAuthorization
} from '~~/server/utils/applicant-recipient-auth'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const applicantRecipientId = getRouterParam(event, 'id')

  if (!applicantRecipientId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  await authorize(event, 'applicant_recipient', 'create', async ({ context: authContext }) =>
    await resolveApplicantRecipientAuthorization(authContext, applicantRecipientId, 'create', db)
  )
  const validated = await readValidatedBodyI18n(event, ApplicantRecipientAgencyFinancialIdCreateSchema)

  const values: Insertable<ApplicantRecipientAgencyFinancialIdTable> = {
    egcs_ar_applicantrecipient: applicantRecipientId,
    egcs_ar_agency: validated.egcs_ar_agency ?? null,
    egcs_ar_financialsystemid: validated.egcs_ar_financialsystemid
  }

  try {
    return await executeFreshAuthorizedApplicantRecipientWrite(
      event,
      db,
      applicantRecipientId,
      'create',
      async trx => {
        if (validated.egcs_ar_agency) {
          const agency = await trx
            .selectFrom('Agency_Profile')
            .where('id', '=', validated.egcs_ar_agency)
            .where('_deleted', '=', false)
            .where('egcs_ay_active', '=', true)
            .select('id')
            .forShare()
            .executeTakeFirst()

          if (!agency) {
            return await badRequest(
              event,
              'INVALID_APPLICANT_RECIPIENT_AGENCY_FINANCIAL_ID_AGENCY',
              'apiErrors.applicant_recipient.invalid_agency_financial_id_agency'
            )
          }
        }

        return await trx
          .insertInto('Applicant_Recipient_Agency_Financial_Id')
          .values(values)
          .returning([
            'Applicant_Recipient_Agency_Financial_Id.id as id',
            'Applicant_Recipient_Agency_Financial_Id.egcs_ar_agency as egcs_ar_agency',
            'Applicant_Recipient_Agency_Financial_Id.egcs_ar_financialsystemid as egcs_ar_financialsystemid'
          ])
          .executeTakeFirstOrThrow()
      }
    )
  } catch (error: unknown) {
    await throwIfApplicantRecipientUniqueConstraintError(event, error)
    throw error
  }
})
