import type { Kysely } from 'kysely'
import type { H3Event } from 'h3'
import type { Database } from '~~/shared/types/database'
import type { Scope } from '~~/shared/utils/scopes'
import { notFound } from '~~/server/utils/api-errors'

export interface TransferPaymentBudgetScopeContext {
  agencyId: string
  profileId: string
  scope: Scope
}

export type TransferPaymentBudgetScopeResolution =
  | { context: TransferPaymentBudgetScopeContext }
  | { response: unknown }

/**
 * Builds the entity scope for a transfer-payment budget collection or record.
 *
 * @param agencyId - Agency that owns the transfer payment.
 * @param profileId - Parent transfer-payment profile id.
 * @param budgetId - Optional child budget id for detail routes.
 * @returns The transfer-payment entity scope.
 */
export const buildTransferPaymentBudgetScope = (
  agencyId: string,
  profileId: string,
  budgetId?: string
): Scope => ({
  type: 'entity',
  agencyId,
  path: [
    { type: 'transfer_payment', id: profileId },
    ...(budgetId ? [{ type: 'transfer_payment_budget' as const, id: budgetId }] : [])
  ]
})

/**
 * Invokes the route-visible not-found handler so unit-test overrides remain supported.
 *
 * @param event - Current H3 event.
 * @returns The not-found response when a test override returns instead of throwing.
 */
const transferPaymentProfileNotFound = async (event: H3Event): Promise<unknown> => {
  const notFoundHandler = (globalThis as { notFound?: typeof notFound }).notFound ?? notFound
  return await notFoundHandler(
    event,
    'TRANSFER_PAYMENT_PROFILE_NOT_FOUND',
    'apiErrors.transfer_payment.profile_not_found'
  )
}

/**
 * Resolves an active transfer-payment parent and its budget authorization scope.
 *
 * @param event - Current H3 event.
 * @param profileId - Requested transfer-payment profile id.
 * @param db - Kysely database client.
 * @param budgetId - Optional child budget id for detail routes.
 * @returns A resolved scope context or the route's not-found response.
 */
export const resolveTransferPaymentBudgetScopeForRoute = async (
  event: H3Event,
  profileId: string,
  db: Kysely<Database>,
  budgetId?: string
): Promise<TransferPaymentBudgetScopeResolution> => {
  const profile = await db
    .selectFrom('Transfer_Payment_Profile')
    .innerJoin(
      'Agency_Profile',
      'Agency_Profile.id',
      'Transfer_Payment_Profile.egcs_tp_agency'
    )
    .where('Transfer_Payment_Profile.id', '=', profileId)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
    .select([
      'Transfer_Payment_Profile.id as profile_id',
      'Transfer_Payment_Profile.egcs_tp_agency as agency_id'
    ])
    .executeTakeFirst()

  if (!profile) {
    return { response: await transferPaymentProfileNotFound(event) }
  }

  const resolvedProfileId = String(profile.profile_id)
  const agencyId = String(profile.agency_id)
  return {
    context: {
      agencyId,
      profileId: resolvedProfileId,
      scope: buildTransferPaymentBudgetScope(agencyId, resolvedProfileId, budgetId)
    }
  }
}
