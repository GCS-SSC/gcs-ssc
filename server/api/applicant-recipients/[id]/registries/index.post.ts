import type { Insertable } from 'kysely'
import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { ApplicantRecipientRegistryCreateSchema } from '~~/shared/types/schemas'
import type { ApplicantRecipientRegistryTable } from '~~/shared/types/database'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { throwIfApplicantRecipientUniqueConstraintError } from '~~/server/utils/applicant-recipient-unique-constraint-errors'
import { executeFreshAuthorizedApplicantRecipientWrite, resolveApplicantRecipientAuthorization } from '~~/server/utils/applicant-recipient-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const applicantRecipientId = getRouterParam(event, 'id')
  if (!applicantRecipientId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(applicantRecipientId)) {
    return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
  }
  await authorize(event, 'applicant_recipient', 'create', async ({ context }) =>
    await resolveApplicantRecipientAuthorization(context, applicantRecipientId, 'create', db)
  )
  const validated = await readValidatedBodyI18n(event, ApplicantRecipientRegistryCreateSchema)
  const values: Insertable<ApplicantRecipientRegistryTable> = {
    egcs_ar_applicantrecipient: applicantRecipientId,
    egcs_ar_number: validated.egcs_ar_number,
    egcs_ar_registry: validated.egcs_ar_registry,
    egcs_ar_othercomment: validated.egcs_ar_othercomment ?? null
  }
  try {
    return await executeFreshAuthorizedApplicantRecipientWrite(event, db, applicantRecipientId, 'create', async trx =>
      await trx.insertInto('Applicant_Recipient_Registry').values(values)
        .returning(['id', 'egcs_ar_number', 'egcs_ar_registry', 'egcs_ar_othercomment']).executeTakeFirstOrThrow()
    )
  } catch (error: unknown) {
    await throwIfApplicantRecipientUniqueConstraintError(event, error)
    throw error
  }
})
