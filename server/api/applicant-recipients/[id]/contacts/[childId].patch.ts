import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { ApplicantRecipientContactPatchSchema } from '~~/shared/types/schemas'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import {
  APPLICANT_RECIPIENT_CHILD_ERROR_KEYS,
  assertApplicantRecipientChildExists
} from '~~/server/utils/applicant-recipient-child-resources'
import { APPLICANT_RECIPIENT_CONTACT_SELECT_COLUMNS } from '~~/server/utils/applicant-recipient-contact-columns'
import { hasOtherActiveCommonContactReferences } from '~~/server/utils/applicant-recipient'
import {
  executeFreshAuthorizedApplicantRecipientWrite,
  resolveApplicantRecipientAuthorization
} from '~~/server/utils/applicant-recipient-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const applicantRecipientId = getRouterParam(event, 'id')
  const childId = getRouterParam(event, 'childId')

  if (!applicantRecipientId || !childId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(applicantRecipientId)) return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
  if (!isPositivePostgresBigintText(childId)) return await notFound(event, ...APPLICANT_RECIPIENT_CHILD_ERROR_KEYS.contactNotFound)

  await authorize(event, 'applicant_recipient', 'update', async ({ context }) =>
    await resolveApplicantRecipientAuthorization(context, applicantRecipientId, 'update', db)
  )
  const validated = await readValidatedBodyI18n(event, ApplicantRecipientContactPatchSchema)
  const values = Object.fromEntries(Object.entries(validated).filter(([, value]) => value !== undefined))

  return await executeFreshAuthorizedApplicantRecipientWrite(
    event,
    db,
    applicantRecipientId,
    'update',
    async trx => {
      const existing = await assertApplicantRecipientChildExists(
        event,
        trx
          .selectFrom('Applicant_Recipient_Contact')
          .innerJoin('Common_Contact', 'Common_Contact.id', 'Applicant_Recipient_Contact.egcs_ar_contact')
          .where('Applicant_Recipient_Contact.id', '=', childId)
          .where('Applicant_Recipient_Contact.egcs_ar_applicantrecipient', '=', applicantRecipientId)
          .where('Applicant_Recipient_Contact._deleted', '=', false)
          .where('Common_Contact._deleted', '=', false)
          .select(APPLICANT_RECIPIENT_CONTACT_SELECT_COLUMNS)
          .forUpdate('Common_Contact')
          .executeTakeFirst(),
        ...APPLICANT_RECIPIENT_CHILD_ERROR_KEYS.contactNotFound
      )
      if (!existing || typeof existing !== 'object' || !('id' in existing)) {
        return existing
      }
      if (!Object.keys(values).length) {
        return existing
      }

      const contactIsShared = await hasOtherActiveCommonContactReferences(
        trx,
        existing.egcs_ar_contact,
        childId
      )
      if (contactIsShared) {
        return await badRequest(
          event,
          'APPLICANT_RECIPIENT_CONTACT_SHARED',
          'apiErrors.applicant_recipient.contact_shared'
        )
      }

      await trx
        .updateTable('Common_Contact')
        .set(values)
        .where('id', '=', existing.egcs_ar_contact)
        .where('_deleted', '=', false)
        .execute()

      return await trx
        .selectFrom('Applicant_Recipient_Contact')
        .innerJoin('Common_Contact', 'Common_Contact.id', 'Applicant_Recipient_Contact.egcs_ar_contact')
        .where('Applicant_Recipient_Contact.id', '=', childId)
        .where('Applicant_Recipient_Contact.egcs_ar_applicantrecipient', '=', applicantRecipientId)
        .where('Applicant_Recipient_Contact._deleted', '=', false)
        .where('Common_Contact._deleted', '=', false)
        .select(APPLICANT_RECIPIENT_CONTACT_SELECT_COLUMNS)
        .executeTakeFirstOrThrow()
    }
  )
})
