import { authorize } from '~~/server/utils/authorize'
import { ApplicantRecipientAddressPatchSchema, CommonAddressSubdivisionSchema } from '~~/shared/types/schemas'
import type { CommonAddressTable } from '~~/shared/types/database'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { parseI18n } from '~~/server/utils/api-validate'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
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
  if (!isPositivePostgresBigintText(childId)) {
    return await notFound(event, ...APPLICANT_RECIPIENT_CHILD_ERROR_KEYS.addressNotFound)
  }
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

      if (validated.egcs_cn_addresscountry !== undefined || validated.egcs_cn_addresssubdivision !== undefined) {
        await parseI18n(event, CommonAddressSubdivisionSchema, {
          egcs_cn_addresscountry: validated.egcs_cn_addresscountry ?? existing.egcs_cn_addresscountry,
          egcs_cn_addresssubdivision: validated.egcs_cn_addresssubdivision ?? existing.egcs_cn_addresssubdivision
        })
      }

      // Compare under the existing physical-row lock using PostgreSQL column
      // types, preserving exact bigint text and avoiding false shared-row edits.
      const hasAddressChanges = Boolean(await trx.selectFrom('Common_Address')
        .select('id')
        .where('id', '=', existing.egcs_ar_address)
        .where('_deleted', '=', false)
        .where(eb => eb.or(Object.entries(values).map(([key, value]) =>
          eb(key as keyof CommonAddressTable, 'is distinct from', value))))
        .executeTakeFirst())
      if (!hasAddressChanges) return existing

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
