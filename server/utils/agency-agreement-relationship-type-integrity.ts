import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { badRequest } from '~~/server/utils/api-errors'

/**
 * Rejects deletion while a live relationship still references the locked type.
 * @param event - Authorized deletion request.
 * @param trx - Transaction holding the Agency and type locks.
 * @param relationshipTypeId - Locked relationship-type identity.
 * @returns Resolves when no active reference exists; otherwise throws.
 */
export const assertAgencyAgreementRelationshipTypeNotInUse = async (
  event: H3Event,
  trx: Transaction<Database>,
  relationshipTypeId: string
) => {
  // Keep direct references even beneath a deleted Agreement, as other Agency catalogs do.
  const relationship = await trx.selectFrom('Funding_Case_Agreement_Relationship')
    .select('id')
    .where('egcs_fc_relationshiptype', '=', relationshipTypeId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (relationship) {
    return await badRequest(event, 'AGENCY_AGREEMENT_RELATIONSHIP_TYPE_IN_USE', 'apiErrors.agency.agreement_relationship_type_in_use')
  }
}
