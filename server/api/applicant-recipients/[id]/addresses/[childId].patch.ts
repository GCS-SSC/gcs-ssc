import { authorize } from '~~/server/utils/authorize'
import { ApplicantRecipientAddressPatchSchema } from '~~/shared/types/schemas'
import { badRequest } from '~~/server/utils/api-errors'
import {
  APPLICANT_RECIPIENT_CHILD_ERROR_KEYS,
  assertApplicantRecipientChildExists
} from '~~/server/utils/applicant-recipient-child-resources'
import { APPLICANT_RECIPIENT_ADDRESS_SELECT_COLUMNS } from '~~/server/utils/applicant-recipient-address-columns'
import { hasOtherActiveCommonAddressReferences } from '~~/server/utils/applicant-recipient'
import {
  executeFreshAuthorizedApplicantRecipientWrite,
  resolveApplicantRecipientAuthorization
} from '~~/server/utils/applicant-recipient-auth'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const applicantRecipientId = getRouterParam(event, 'id')
  const childId = getRouterParam(event, 'childId')

  if (!applicantRecipientId || !childId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  await authorize(event, 'applicant_recipient', 'update', async ({ context }) =>
    await resolveApplicantRecipientAuthorization(context, applicantRecipientId, 'update', db)
  )
  const validated = await readValidatedBodyI18n(event, ApplicantRecipientAddressPatchSchema)
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
          .selectFrom('Applicant_Recipient_Address')
          .innerJoin('Common_Address', 'Common_Address.id', 'Applicant_Recipient_Address.egcs_ar_address')
          .where('Applicant_Recipient_Address.id', '=', childId)
          .where('Applicant_Recipient_Address.egcs_ar_applicantrecipient', '=', applicantRecipientId)
          .where('Applicant_Recipient_Address._deleted', '=', false)
          .where('Common_Address._deleted', '=', false)
          .select(APPLICANT_RECIPIENT_ADDRESS_SELECT_COLUMNS)
          .forUpdate(['Applicant_Recipient_Address', 'Common_Address'])
          .executeTakeFirst(),
        ...APPLICANT_RECIPIENT_CHILD_ERROR_KEYS.addressNotFound
      )
      if (!existing || typeof existing !== 'object' || !('id' in existing)) {
        return existing
      }
      if (!Object.keys(values).length) {
        return existing
      }

      const addressIsShared = await hasOtherActiveCommonAddressReferences(
        trx,
        existing.egcs_ar_address,
        childId
      )
      if (addressIsShared) {
        return await badRequest(
          event,
          'APPLICANT_RECIPIENT_ADDRESS_SHARED',
          'apiErrors.applicant_recipient.address_shared'
        )
      }

      await trx
        .updateTable('Common_Address')
        .set(values)
        .where('id', '=', existing.egcs_ar_address)
        .where('_deleted', '=', false)
        .execute()

      return await trx
        .selectFrom('Applicant_Recipient_Address')
        .innerJoin('Common_Address', 'Common_Address.id', 'Applicant_Recipient_Address.egcs_ar_address')
        .where('Applicant_Recipient_Address.id', '=', childId)
        .where('Applicant_Recipient_Address.egcs_ar_applicantrecipient', '=', applicantRecipientId)
        .where('Applicant_Recipient_Address._deleted', '=', false)
        .where('Common_Address._deleted', '=', false)
        .select(APPLICANT_RECIPIENT_ADDRESS_SELECT_COLUMNS)
        .executeTakeFirstOrThrow()
    }
  )
})
