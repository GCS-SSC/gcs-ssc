import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import {
  buildTransferPaymentStreamScopeContext,
  resolveTransferPaymentBaseStreamScopeContext,
  type TransferPaymentStreamScopeContext
} from './transfer-payment-stream-scope'

export type TransferPaymentAmendmentTypeScopeContext = TransferPaymentStreamScopeContext

/**
 * Resolves the scope context for a transfer payment stream.
 *
 * @param profileId - The ID of the transfer payment profile.
 * @param streamId - The ID of the transfer payment stream.
 * @param db - The database instance.
 * @returns The resolved scope context or null if not found.
 */
export const resolveTransferPaymentStreamScopeContext = async (
  profileId: string,
  streamId: string,
  db: Kysely<Database>
): Promise<TransferPaymentAmendmentTypeScopeContext | null> =>
  resolveTransferPaymentBaseStreamScopeContext(profileId, streamId, db)

/**
 * Resolves the scope context for a transfer payment amendment type.
 *
 * @param profileId - The ID of the transfer payment profile.
 * @param streamId - The ID of the transfer payment stream.
 * @param amendmentTypeId - The ID of the amendment type.
 * @param db - The database instance.
 * @returns The resolved scope context or null if not found.
 */
export const resolveTransferPaymentAmendmentTypeScopeContext = async (
  profileId: string,
  streamId: string,
  amendmentTypeId: string,
  db: Kysely<Database>
): Promise<TransferPaymentAmendmentTypeScopeContext | null> => {
  const amendmentType = await db
    .selectFrom('Transfer_Payment_Amendment_Type')
    .innerJoin(
      'Transfer_Payment_Stream',
      'Transfer_Payment_Stream.id',
      'Transfer_Payment_Amendment_Type.egcs_tp_transferpaymentstream'
    )
    .innerJoin(
      'Transfer_Payment_Profile',
      'Transfer_Payment_Profile.id',
      'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
    )
    .where('Transfer_Payment_Amendment_Type.id', '=', amendmentTypeId)
    .where('Transfer_Payment_Amendment_Type.egcs_tp_transferpaymentstream', '=', streamId)
    .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
    .where('Transfer_Payment_Amendment_Type._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .select(['Transfer_Payment_Profile.egcs_tp_agency as agency_id'])
    .executeTakeFirst()

  if (!amendmentType?.agency_id) {
    return null
  }

  return buildTransferPaymentStreamScopeContext(String(amendmentType.agency_id), profileId, streamId)
}
