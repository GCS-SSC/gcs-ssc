/* eslint-disable jsdoc/require-jsdoc -- Stream scope helpers expose typed contracts covered by authorization tests. */
import type { Kysely } from 'kysely'
import type { H3Event } from 'h3'
import type { Database } from '~~/shared/types/database'
import type { Scope } from '~~/shared/utils/scopes'
import { notFound } from '~~/server/utils/api-errors'
import type { AuthContext } from '~~/server/utils/authorize'

export interface TransferPaymentStreamScopeContext {
  agencyId: string
  profileId: string
  streamId: string
  scope: Scope
}

export const buildTransferPaymentStreamScope = (agencyId: string, profileId: string, streamId: string): Scope => ({
  type: 'entity',
  agencyId,
  path: [
    { type: 'transfer_payment', id: profileId },
    { type: 'transfer_payment_stream', id: streamId }
  ]
})

export const buildTransferPaymentStreamScopeContext = (
  agencyId: string,
  profileId: string,
  streamId: string
): TransferPaymentStreamScopeContext => ({
  agencyId,
  profileId,
  streamId,
  scope: buildTransferPaymentStreamScope(agencyId, profileId, streamId)
})

export const resolveTransferPaymentBaseStreamScopeContext = async (
  profileId: string,
  streamId: string,
  db: Kysely<Database>
): Promise<TransferPaymentStreamScopeContext | null> => {
  const stream = await db
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
    .select(['Transfer_Payment_Profile.egcs_tp_agency as agency_id'])
    .executeTakeFirst()

  return stream?.agency_id
    ? buildTransferPaymentStreamScopeContext(String(stream.agency_id), profileId, streamId)
    : null
}

const routeNotFound = async (
  event: H3Event,
  code: string,
  key: string
) => {
  const notFoundHandler = (globalThis as { notFound?: typeof notFound }).notFound ?? notFound
  return await notFoundHandler(event, code, key)
}

export const resolveTransferPaymentStreamScopeContextForRoute = async (
  event: H3Event,
  profileId: string,
  streamId: string,
  db: Kysely<Database>
) => {
  const streamContext = await resolveTransferPaymentBaseStreamScopeContext(profileId, streamId, db)
  if (!streamContext) {
    return await routeNotFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  return streamContext
}

export const authorizeTransferPaymentStreamReadScope = async (
  scope: Scope,
  _db: Kysely<Database>,
  context: AuthContext
): Promise<{ bypass: true } | { scope: Scope }> => {
  const canAccess = context.userAbilities.authorize(
    'transfer_payment',
    'read',
    scope
  )

  if (canAccess) {
    return { bypass: true }
  }

  return { scope }
}

export const authorizeTransferPaymentStreamCreateScope = async (
  scope: Scope,
  _db: Kysely<Database>,
  context: AuthContext
): Promise<{ bypass: true } | { scope: Scope }> => {
  const canAccess = context.userAbilities.authorize(
    'transfer_payment',
    'create',
    scope
  )

  if (canAccess) {
    return { bypass: true }
  }

  return { scope }
}
