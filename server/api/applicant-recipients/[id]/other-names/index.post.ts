import type { Insertable } from 'kysely'
import { authorize } from '~~/server/utils/authorize'
import { ApplicantRecipientOtherNameCreateSchema } from '~~/shared/types/schemas'
import type { ApplicantRecipientOtherNameTable } from '~~/shared/types/database'
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

  await authorize(event, 'applicant_recipient', 'create', async ({ context }) =>
    await resolveApplicantRecipientAuthorization(context, applicantRecipientId, 'create', db)
  )
  const validated = await readValidatedBodyI18n(event, ApplicantRecipientOtherNameCreateSchema)
  const values: Insertable<ApplicantRecipientOtherNameTable> = {
    egcs_ar_applicantrecipient: applicantRecipientId,
    egcs_ar_othername: validated.egcs_ar_othername
  }

  try {
    return await executeFreshAuthorizedApplicantRecipientWrite(
      event,
      db,
      applicantRecipientId,
      'create',
      async trx => await trx
        .insertInto('Applicant_Recipient_Other_Name')
        .values(values)
        .returning(['id', 'egcs_ar_othername'])
        .executeTakeFirstOrThrow()
    )
  } catch (error: unknown) {
    await throwIfApplicantRecipientUniqueConstraintError(event, error)
    throw error
  }
})
