import type { Insertable } from 'kysely'
import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { ApplicantRecipientContactCreateSchema } from '~~/shared/types/schemas'
import type { ApplicantRecipientContactTable, CommonContactTable } from '~~/shared/types/database'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { throwIfApplicantRecipientUniqueConstraintError } from '~~/server/utils/applicant-recipient-unique-constraint-errors'
import {
  executeFreshAuthorizedApplicantRecipientWrite,
  resolveApplicantRecipientAuthorization
} from '~~/server/utils/applicant-recipient-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const applicantRecipientId = getRouterParam(event, 'id')

  if (!applicantRecipientId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(applicantRecipientId)) {
    return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
  }

  await authorize(event, 'applicant_recipient', 'create', async ({ context }) =>
    await resolveApplicantRecipientAuthorization(context, applicantRecipientId, 'create', db)
  )
  const validated = await readValidatedBodyI18n(event, ApplicantRecipientContactCreateSchema)

  const contactValues: Insertable<CommonContactTable> = {
    egcs_cn_title: validated.egcs_cn_title,
    egcs_cn_name: validated.egcs_cn_name,
    egcs_cn_businessphone: validated.egcs_cn_businessphone,
    egcs_cn_businessphoneextension: validated.egcs_cn_businessphoneextension,
    egcs_cn_generallanguagepreference: validated.egcs_cn_generallanguagepreference,
    egcs_cn_jobtitle_en: validated.egcs_cn_jobtitle_en,
    egcs_cn_jobtitle_fr: validated.egcs_cn_jobtitle_fr,
    egcs_cn_primaryaccount: validated.egcs_cn_primaryaccount,
    egcs_cn_email: validated.egcs_cn_email
  }

  let link
  try {
    link = await executeFreshAuthorizedApplicantRecipientWrite(
      event,
      db,
      applicantRecipientId,
      'create',
      async tx => {
        const contact = await tx
          .insertInto('Common_Contact')
          .values(contactValues)
          .returning('id')
          .executeTakeFirstOrThrow()

        const linkValues: Insertable<ApplicantRecipientContactTable> = {
          egcs_ar_applicantrecipient: applicantRecipientId,
          egcs_ar_contact: contact.id
        }

        return await tx
          .insertInto('Applicant_Recipient_Contact')
          .values(linkValues)
          .returning(['id', 'egcs_ar_applicantrecipient', 'egcs_ar_contact'])
          .executeTakeFirstOrThrow()
      }
    )
  } catch (error) {
    await throwIfApplicantRecipientUniqueConstraintError(event, error)
    throw error
  }

  return {
    ...link,
    ...validated
  }
})
