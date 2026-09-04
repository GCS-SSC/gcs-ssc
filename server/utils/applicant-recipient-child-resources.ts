import type { H3Event } from 'h3'
import type { Kysely } from 'kysely'
import { notFound } from '~~/server/utils/api-errors'
import type { Database } from '~~/shared/types/database'

export const APPLICANT_RECIPIENT_CHILD_ERROR_KEYS = {
  agencyFinancialIdNotFound: ['APPLICANT_RECIPIENT_AGENCY_FINANCIAL_ID_NOT_FOUND', 'apiErrors.applicant_recipient.agency_financial_id_not_found'],
  registryNotFound: ['APPLICANT_RECIPIENT_REGISTRY_NOT_FOUND', 'apiErrors.applicant_recipient.registry_not_found'],
  otherNameNotFound: ['APPLICANT_RECIPIENT_OTHER_NAME_NOT_FOUND', 'apiErrors.applicant_recipient.other_name_not_found'],
  addressNotFound: ['APPLICANT_RECIPIENT_ADDRESS_NOT_FOUND', 'apiErrors.applicant_recipient.address_not_found'],
  contactNotFound: ['APPLICANT_RECIPIENT_CONTACT_NOT_FOUND', 'apiErrors.applicant_recipient.contact_not_found']
} as const

type ApplicantRecipientProfileLookup = {
  id: string
  egcs_ar_leadagency?: string | null
}

type ApplicantRecipientProfileLookupResult = ApplicantRecipientProfileLookup | Awaited<ReturnType<typeof notFound>>

/**
 * Resolves an active applicant recipient profile by id.
 *
 * @param event - The active H3 event.
 * @param applicantRecipientId - Applicant recipient profile id.
 * @param db - Database instance.
 * @returns The active applicant recipient profile row.
 */
export const assertApplicantRecipientProfileExists = async (
  event: H3Event,
  applicantRecipientId: string,
  db: Kysely<Database>
): Promise<ApplicantRecipientProfileLookupResult> => {
  const profile = await db
    .selectFrom('Applicant_Recipient_Profile')
    .where('id', '=', applicantRecipientId)
    .where('_deleted', '=', false)
    .select(['id', 'egcs_ar_leadagency'])
    .executeTakeFirst()

  if (!profile) {
    return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
  }

  return profile
}

/**
 * Resolves a child record scoped to an applicant recipient and throws a localized not found error when missing.
 *
 * @param event - The active H3 event.
 * @param query - Child lookup query promise.
 * @param code - Stable API error code.
 * @param key - Localized translation key.
 * @returns The resolved child row.
 */
export const assertApplicantRecipientChildExists = async <T>(
  event: H3Event,
  query: Promise<T | undefined>,
  code: string,
  key: string
): Promise<T | Awaited<ReturnType<typeof notFound>>> => {
  const row = await query

  if (!row) {
    return await notFound(event, code, key)
  }

  return row
}
