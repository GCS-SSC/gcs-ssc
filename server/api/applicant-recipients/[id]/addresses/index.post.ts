import type { Insertable } from 'kysely'
import { authorize } from '~~/server/utils/authorize'
import { ApplicantRecipientAddressCreateSchema } from '~~/shared/types/schemas'
import type { ApplicantRecipientAddressTable, CommonAddressTable } from '~~/shared/types/database'
import { badRequest } from '~~/server/utils/api-errors'
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
  const validated = await readValidatedBodyI18n(event, ApplicantRecipientAddressCreateSchema)

  const addressValues: Insertable<CommonAddressTable> = {
    egcs_cn_federalridingid: validated.egcs_cn_federalridingid,
    egcs_cn_addresscity: validated.egcs_cn_addresscity,
    egcs_cn_addresscountry: validated.egcs_cn_addresscountry,
    egcs_cn_addresssubdivision: validated.egcs_cn_addresssubdivision,
    egcs_cn_gc_addressid: validated.egcs_cn_gc_addressid,
    egcs_cn_latitude: validated.egcs_cn_latitude,
    egcs_cn_longitude: validated.egcs_cn_longitude,
    egcs_cn_mainphone: validated.egcs_cn_mainphone,
    egcs_cn_mainphoneextension: validated.egcs_cn_mainphoneextension,
    egcs_cn_postalcodezipcode: validated.egcs_cn_postalcodezipcode,
    egcs_cn_street1: validated.egcs_cn_street1,
    egcs_cn_street2: validated.egcs_cn_street2,
    egcs_cn_street3: validated.egcs_cn_street3
  }

  const link = await executeFreshAuthorizedApplicantRecipientWrite(
    event,
    db,
    applicantRecipientId,
    'create',
    async tx => {
      const address = await tx
        .insertInto('Common_Address')
        .values(addressValues)
        .returning('id')
        .executeTakeFirstOrThrow()

      const linkValues: Insertable<ApplicantRecipientAddressTable> = {
        egcs_ar_applicantrecipient: applicantRecipientId,
        egcs_ar_address: address.id
      }

      return await tx
        .insertInto('Applicant_Recipient_Address')
        .values(linkValues)
        .returning(['id', 'egcs_ar_applicantrecipient', 'egcs_ar_address'])
        .executeTakeFirstOrThrow()
    }
  )

  return {
    ...link,
    ...validated
  }
})
