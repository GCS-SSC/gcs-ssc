import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { badRequest } from '~~/server/utils/api-errors'

/**
 * Rejects deleting a type referenced by a nondeleted Agreement address.
 * @param event - The authorized deletion request.
 * @param trx - Transaction holding the Agency and address-type locks.
 * @param addressTypeId - The locked address-type identity.
 * @returns Resolves when no reference remains; otherwise throws.
 */
export const assertAgencyAddressTypeNotInUse = async (
  event: H3Event,
  trx: Transaction<Database>,
  addressTypeId: string
) => {
  // Keep the direct reference even under a deleted Agreement. Do not lock the
  // referencing row: Agreement writers lock their owner before the address type.
  const address = await trx.selectFrom('Funding_Case_Agreement_Address')
    .select('id')
    .where('egcs_fc_addresstype', '=', addressTypeId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (address) {
    return await badRequest(event, 'AGENCY_ADDRESS_TYPE_IN_USE', 'apiErrors.agency.address_type_in_use')
  }
}
