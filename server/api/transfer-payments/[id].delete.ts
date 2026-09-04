import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { Scope } from '~~/shared/utils/scopes'
import {
  authorizeWithFreshAuthContext,
  requireFreshAuthContext
} from '~~/server/utils/authorize'
import {
  guardRegisteredExtensionScopeDeletion,
  lockRegisteredExtensionAgreementScopes
} from '~~/server/utils/extensions'
import { lockTransferPaymentStreams } from '~~/server/utils/transfer-payment-stream-lock'
import { authorizeTransferPaymentProfileResource } from '~~/server/utils/transfer-payment-route-authorization'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

type TransferPaymentProfileDeleteContext = {
  agencyId: string
  streamIds: string[]
}

/** Signals that the profile's active deletion scope changed before all locks were held. */
class TransferPaymentProfileDeleteScopeChanged extends Error {
  /**
   * Carries the newly observed profile and active-stream scope into the next lock attempt.
   *
   * @param context - Newly observed profile deletion context.
   */
  constructor(readonly context: TransferPaymentProfileDeleteContext) {
    super('Transfer-payment profile deletion scope changed while acquiring locks.')
  }
}

/**
 * Resolves the active profile's agency and deterministically ordered active streams.
 *
 * @param db - Database or owning transaction used for the lookup.
 * @param profileId - Transfer-payment profile identifier.
 * @returns Active deletion context, or null when the profile is inactive.
 */
const resolveDeleteContext = async (
  db: Kysely<Database> | Transaction<Database>,
  profileId: string
): Promise<TransferPaymentProfileDeleteContext | null> => {
  const profile = await db
    .selectFrom('Transfer_Payment_Profile')
    .select('egcs_tp_agency')
    .where('id', '=', profileId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!profile) {
    return null
  }
  const streams = await db
    .selectFrom('Transfer_Payment_Stream')
    .select('id')
    .where('egcs_tp_transferpaymentprofile', '=', profileId)
    .where('_deleted', '=', false)
    .orderBy('id', 'asc')
    .execute()
  return {
    agencyId: String(profile.egcs_tp_agency),
    streamIds: streams.map(stream => String(stream.id))
  }
}

/**
 * Compares two already ordered profile deletion contexts.
 *
 * @param expected - Context whose locks were acquired.
 * @param current - Context re-resolved after locking.
 * @returns Whether the agency and ordered streams are unchanged.
 */
const contextsMatch = (
  expected: TransferPaymentProfileDeleteContext,
  current: TransferPaymentProfileDeleteContext
): boolean => expected.agencyId === current.agencyId
  && expected.streamIds.length === current.streamIds.length
  && expected.streamIds.every((streamId, index) => streamId === current.streamIds[index])

/**
 * Builds the direct transfer-payment authorization scope for profile deletion.
 *
 * @param profileId - Transfer-payment profile identifier.
 * @param agencyId - Owning agency identifier.
 * @returns Entity scope used for authorization.
 */
const deleteScope = (
  profileId: string,
  agencyId: string
): Scope => ({
  type: 'entity',
  agencyId,
  path: [{ type: 'transfer_payment', id: profileId }]
})

/** Soft-deletes a transfer-payment profile after locking authorization, extension, stream, and profile scope. */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  if (!profileId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(profileId)) {
    return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
  }

  const access = await authorizeTransferPaymentProfileResource(event, 'delete', profileId)
  if (!access) {
    return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
  }
  const initialContext = await resolveDeleteContext(db, profileId)
  if (!initialContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
  }

  let lockContext = initialContext
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.transaction().execute(async trx => {
        const authContext = await requireFreshAuthContext(event, trx)
        await lockRegisteredExtensionAgreementScopes(trx, lockContext.agencyId, lockContext.streamIds)
        await lockTransferPaymentStreams(trx, lockContext.streamIds)

        const profile = await trx
          .selectFrom('Transfer_Payment_Profile')
          .select('id')
          .where('id', '=', profileId)
          .where('_deleted', '=', false)
          .forUpdate('Transfer_Payment_Profile')
          .executeTakeFirst()
        if (!profile) {
          return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
        }

        const currentContext = await resolveDeleteContext(trx, profileId)
        if (!currentContext) {
          return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
        }
        if (!contextsMatch(lockContext, currentContext)) {
          throw new TransferPaymentProfileDeleteScopeChanged(currentContext)
        }

        await authorizeWithFreshAuthContext(
          event,
          authContext,
          'transfer_payment',
          'delete',
          deleteScope(profileId, currentContext.agencyId)
        )
        for (const streamId of currentContext.streamIds) {
          await guardRegisteredExtensionScopeDeletion(event, trx, {
            scope: 'stream',
            agencyId: currentContext.agencyId,
            streamId
          })
        }
        await trx
          .updateTable('Transfer_Payment_Profile')
          .set({ _deleted: true })
          .where('id', '=', profileId)
          .where('_deleted', '=', false)
          .execute()
        return { success: true }
      })
    } catch (error: unknown) {
      if (!(error instanceof TransferPaymentProfileDeleteScopeChanged)) {
        throw error
      }
      lockContext = error.context
    }
  }

  return await badRequest(event, 'TRANSFER_PAYMENT_PROFILE_SCOPE_CHANGED', 'apiErrors.transfer_payment.profile_scope_changed')
})
