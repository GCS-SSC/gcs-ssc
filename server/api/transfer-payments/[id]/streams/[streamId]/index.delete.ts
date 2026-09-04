import type { Scope } from '~~/shared/utils/scopes'
import {
  authorizeWithFreshAuthContext,
  requireFreshAuthContext
} from '~~/server/utils/authorize'
import {
  authorizeTransferPaymentStreamResource,
  createTransferPaymentScopedAuthorizeHandler
} from '~~/server/utils/transfer-payment-route-authorization'
import {
  guardRegisteredExtensionScopeDeletion,
  lockRegisteredExtensionAgreementScopes
} from '~~/server/utils/extensions'
import { lockTransferPaymentStreams } from '~~/server/utils/transfer-payment-stream-lock'

/** Internal retry signal when a stream's agency changes while locks are acquired. */
class TransferPaymentStreamScopeChanged extends Error {
  /**
   * Creates a retry signal carrying the current agency identifier.
   *
   * @param agencyId - Current agency identifier discovered under the stream lock.
   */
  constructor(readonly agencyId: string) {
    super('Transfer-payment stream scope changed while acquiring lifecycle locks.')
  }
}

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
// eslint-disable-next-line local/require-authorize -- delegated to authorizeTransferPaymentStreamResource
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const access = await authorizeTransferPaymentStreamResource(event, 'delete', profileId, streamId)
  if (!access) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  const scope: Scope = {
    type: 'entity',
    agencyId: access.agencyId,
    path: [
      { type: 'transfer_payment', id: profileId },
      { type: 'transfer_payment_stream', id: streamId }
    ]
  }

  let lockAgencyId = access.agencyId
  let completed = false
  let transactionResult: unknown
  for (let attempt = 0; attempt < 3 && !completed; attempt += 1) {
    try {
      transactionResult = await db.transaction().execute(async trx => {
        const authContext = await requireFreshAuthContext(event, trx)
        await lockRegisteredExtensionAgreementScopes(trx, lockAgencyId, [streamId])
        const lockedStreams = await lockTransferPaymentStreams(trx, [streamId])
        if (!lockedStreams.has(streamId)) {
          return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
        }

        const currentStream = await trx
          .selectFrom('Transfer_Payment_Stream')
          .innerJoin(
            'Transfer_Payment_Profile',
            'Transfer_Payment_Profile.id',
            'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
          )
          .where('Transfer_Payment_Stream.id', '=', streamId)
          .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
          .where('Transfer_Payment_Stream._deleted', '=', false)
          .where('Transfer_Payment_Profile._deleted', '=', false)
          .select('Transfer_Payment_Profile.egcs_tp_agency as agency_id')
          .executeTakeFirst()
        if (!currentStream) {
          return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
        }
        const currentAgencyId = String(currentStream.agency_id)
        if (currentAgencyId !== lockAgencyId) {
          throw new TransferPaymentStreamScopeChanged(currentAgencyId)
        }

        const currentScope: Scope = {
          ...scope,
          agencyId: currentAgencyId
        }
        await authorizeWithFreshAuthContext(
          event,
          authContext,
          'transfer_payment',
          'delete',
          createTransferPaymentScopedAuthorizeHandler('delete', currentScope, trx)
        )
        await guardRegisteredExtensionScopeDeletion(event, trx, {
          scope: 'stream',
          agencyId: currentAgencyId,
          streamId
        })
        await trx
          .updateTable('Transfer_Payment_Stream')
          .set({ _deleted: true })
          .where('id', '=', streamId)
          .where('_deleted', '=', false)
          .execute()
      })
      if (transactionResult && typeof transactionResult === 'object' && 'statusCode' in transactionResult) {
        return transactionResult
      }
      completed = true
    } catch (error: unknown) {
      if (!(error instanceof TransferPaymentStreamScopeChanged)) {
        throw error
      }
      lockAgencyId = error.agencyId
    }
  }

  if (!completed) {
    return await badRequest(event, 'TRANSFER_PAYMENT_STREAM_SCOPE_CHANGED', 'apiErrors.request.invalid_status')
  }

  return { success: true }
})
