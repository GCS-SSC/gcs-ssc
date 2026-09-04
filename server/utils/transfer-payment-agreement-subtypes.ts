import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import {
  resolveTransferPaymentBaseStreamScopeContext,
  type TransferPaymentStreamScopeContext
} from './transfer-payment-stream-scope'

export type TransferPaymentAgreementSubtypeScopeContext = TransferPaymentStreamScopeContext

/**
 * Resolves the owning agency and authorization scope for a stream agreement subtype route.
 *
 * @param profileId - Transfer payment profile id.
 * @param streamId - Transfer payment stream id.
 * @param db - Database connection.
 * @returns Stream scope context when the stream exists; otherwise null.
 */
export const resolveTransferPaymentAgreementSubtypeStreamScopeContext = async (
  profileId: string,
  streamId: string,
  db: Kysely<Database>
): Promise<TransferPaymentAgreementSubtypeScopeContext | null> =>
  resolveTransferPaymentBaseStreamScopeContext(profileId, streamId, db)
