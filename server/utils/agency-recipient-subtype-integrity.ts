import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { badRequest } from '~~/server/utils/api-errors'

/**
 * Preserves subtypes referenced by live eligibility links or Proponent profiles.
 * @param event - Authorized deletion request.
 * @param trx - Transaction holding the Agency and subtype locks.
 * @param subtypeId - Locked subtype identity.
 * @returns Resolves when no live direct reference remains.
 */
export const assertAgencyRecipientSubtypeNotInUse = async (
  event: H3Event,
  trx: Transaction<Database>,
  subtypeId: string
) => {
  // Reference writers lock the Agency before the subtype. Read their rows
  // without locking: Proponent updates already hold their own profile lock.
  const eligibleRecipient = await trx.selectFrom('Transfer_Payment_Stream_Eligible_Recipient')
    .select('id')
    .where('egcs_tp_applicantrecipientsubtype', '=', subtypeId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  const proponent = await trx.selectFrom('Applicant_Recipient_Profile')
    .select('id')
    .where('egcs_ar_applicantrecipientsubtypes', '=', subtypeId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (eligibleRecipient || proponent) {
    return await badRequest(event, 'AGENCY_APPLICANT_RECIPIENT_SUBTYPE_IN_USE', 'apiErrors.agency.applicant_recipient_subtype_in_use')
  }
}
