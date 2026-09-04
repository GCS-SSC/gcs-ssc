import type { Kysely } from 'kysely'
import type { H3Event } from 'h3'
import type { AuthContext } from '~~/server/utils/authorize'
import { authorize } from '~~/server/utils/authorize'
import { resolveTransferPaymentStreamScopeContext } from '~~/server/utils/transfer-payment-amendment-types'
import type { Database } from '~~/shared/types/database'
import type { Scope } from '~~/shared/utils/scopes'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

type TransferPaymentAuthorizeHandlerArgs = {
  context: AuthContext
}

type TransferPaymentAuthorizeResolution =
  | { bypass: true }
  | { scope: Scope }

type TransferPaymentAction = 'create' | 'read' | 'update' | 'delete'

const isDatabaseId = isPositivePostgresBigintText

/**
 * Authorizes a profile without revealing whether an inaccessible id exists.
 *
 * @param event - Active request event.
 * @param action - Requested transfer-payment action.
 * @param profileId - Profile identifier from the route.
 * @returns Canonical owner context, or null for an authorized missing resource.
 */
export const authorizeTransferPaymentProfileResource = async (
  event: H3Event,
  action: TransferPaymentAction,
  profileId: string
) => {
  const db = event.context.$db
  const { data } = await authorize<TransferPaymentAction, { agencyId: string } | null>(
    event,
    'transfer_payment',
    action,
    async () => {
      if (!isDatabaseId(profileId)) return { scope: { type: 'global' }, data: null }
      const profile = await db.selectFrom('Transfer_Payment_Profile')
        .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
        .select('Transfer_Payment_Profile.egcs_tp_agency as egcs_tp_agency')
        .where('Transfer_Payment_Profile.id', '=', profileId)
        .where('Transfer_Payment_Profile._deleted', '=', false)
        .where('Agency_Profile._deleted', '=', false)
        .executeTakeFirst()
      if (!profile) return { scope: { type: 'global' }, data: null }
      return {
        scope: {
          type: 'entity', agencyId: String(profile.egcs_tp_agency),
          path: [{ type: 'transfer_payment', id: profileId }]
        },
        data: { agencyId: String(profile.egcs_tp_agency) }
      }
    }
  )
  return data ?? null
}

/**
 * Authorizes a stream without revealing whether an inaccessible profile/stream pair exists.
 *
 * @param event - Active request event.
 * @param action - Requested transfer-payment action.
 * @param profileId - Owning profile identifier.
 * @param streamId - Stream identifier.
 * @returns Canonical stream context, or null for an authorized missing resource.
 */
export const authorizeTransferPaymentStreamResource = async (
  event: H3Event,
  action: TransferPaymentAction,
  profileId: string,
  streamId: string
) => {
  const db = event.context.$db
  const { data } = await authorize<TransferPaymentAction, Awaited<ReturnType<typeof resolveTransferPaymentStreamScopeContext>>>(
    event,
    'transfer_payment',
    action,
    async () => {
      if (!isDatabaseId(profileId) || !isDatabaseId(streamId)) return { scope: { type: 'global' }, data: null }
      const context = await resolveTransferPaymentStreamScopeContext(profileId, streamId, db)
      return context
        ? { scope: context.scope, data: context }
        : { scope: { type: 'global' }, data: null }
    }
  )
  return data ?? null
}

/**
 * Authorizes an outcome through its active canonical profile ownership chain.
 *
 * @param event - Active request event.
 * @param action - Requested transfer-payment action.
 * @param profileId - Owning profile identifier.
 * @param outcomeId - Outcome identifier.
 * @returns Canonical outcome access context, or null for authorized absence.
 */
export const authorizeTransferPaymentOutcomeResource = async (
  event: H3Event,
  action: TransferPaymentAction,
  profileId: string,
  outcomeId: string
) => {
  const db = event.context.$db
  const { data } = await authorize<TransferPaymentAction, { agencyId: string, scope: Scope } | null>(
    event,
    'transfer_payment',
    action,
    async () => {
      if (!isDatabaseId(profileId) || !isDatabaseId(outcomeId)) return { scope: { type: 'global' }, data: null }
      const outcome = await db.selectFrom('Transfer_Payment_Outcome')
        .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Outcome.egcs_tp_transferpaymentprofile')
        .where('Transfer_Payment_Outcome.id', '=', outcomeId)
        .where('Transfer_Payment_Outcome.egcs_tp_transferpaymentprofile', '=', profileId)
        .where('Transfer_Payment_Outcome._deleted', '=', false)
        .where('Transfer_Payment_Profile._deleted', '=', false)
        .select('Transfer_Payment_Profile.egcs_tp_agency as agency_id')
        .executeTakeFirst()
      if (!outcome) return { scope: { type: 'global' }, data: null }
      const scope: Scope = {
        type: 'entity', agencyId: String(outcome.agency_id),
        path: [
          { type: 'transfer_payment', id: profileId },
          { type: 'transfer_payment_outcome', id: outcomeId }
        ]
      }
      return { scope, data: { agencyId: String(outcome.agency_id), scope } }
    }
  )
  return data ?? null
}

/**
 * Authorizes an objective through its active canonical profile ownership chain.
 *
 * @param event - Active request event.
 * @param action - Requested transfer-payment action.
 * @param profileId - Owning profile identifier.
 * @param objectiveId - Objective identifier.
 * @returns Canonical objective access context, or null for authorized absence.
 */
export const authorizeTransferPaymentObjectiveResource = async (
  event: H3Event,
  action: TransferPaymentAction,
  profileId: string,
  objectiveId: string
) => {
  const db = event.context.$db
  const { data } = await authorize<TransferPaymentAction, { agencyId: string, scope: Scope } | null>(
    event, 'transfer_payment', action, async () => {
      if (!isDatabaseId(profileId) || !isDatabaseId(objectiveId)) return { scope: { type: 'global' }, data: null }
      const objective = await db.selectFrom('Transfer_Payment_Objective')
        .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Objective.egcs_tp_transferpaymentprofile')
        .where('Transfer_Payment_Objective.id', '=', objectiveId)
        .where('Transfer_Payment_Objective.egcs_tp_transferpaymentprofile', '=', profileId)
        .where('Transfer_Payment_Objective._deleted', '=', false)
        .where('Transfer_Payment_Profile._deleted', '=', false)
        .select('Transfer_Payment_Profile.egcs_tp_agency as agency_id').executeTakeFirst()
      if (!objective) return { scope: { type: 'global' }, data: null }
      const scope: Scope = {
        type: 'entity', agencyId: String(objective.agency_id),
        path: [
          { type: 'transfer_payment', id: profileId },
          { type: 'transfer_payment_objective', id: objectiveId }
        ]
      }
      return { scope, data: { agencyId: String(objective.agency_id), scope } }
    }
  )
  return data ?? null
}

/**
 * Authorizes an active program budget through its canonical profile ownership chain.
 *
 * @param event - Active request event.
 * @param action - Requested transfer-payment action.
 * @param profileId - Owning profile identifier.
 * @param budgetId - Program budget identifier.
 * @returns Canonical budget access or an authorized missing-resource discriminator.
 */
export const authorizeTransferPaymentBudgetResource = async (
  event: H3Event, action: TransferPaymentAction, profileId: string, budgetId: string
) => {
  const db = event.context.$db
  const { data } = await authorize<TransferPaymentAction, { agencyId: string, scope: Scope } | { missing: 'profile' | 'budget' }>(
    event, 'transfer_payment', action, async () => {
      if (!isDatabaseId(profileId)) return { scope: { type: 'global' }, data: { missing: 'profile' as const } }
      if (!isDatabaseId(budgetId)) return { scope: { type: 'global' }, data: { missing: 'budget' as const } }
      const profile = await db.selectFrom('Transfer_Payment_Profile')
        .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
        .where('Transfer_Payment_Profile.id', '=', profileId)
        .where('Transfer_Payment_Profile._deleted', '=', false)
        .where('Agency_Profile._deleted', '=', false)
        .select('Transfer_Payment_Profile.egcs_tp_agency as agency_id').executeTakeFirst()
      if (!profile) return { scope: { type: 'global' }, data: { missing: 'profile' as const } }
      const budget = await db.selectFrom('Transfer_Payment_Fiscal_Year_Budget')
        .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_transferpaymentprofile')
        .where('Transfer_Payment_Fiscal_Year_Budget.id', '=', budgetId)
        .where('Transfer_Payment_Fiscal_Year_Budget.egcs_tp_transferpaymentprofile', '=', profileId)
        .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
        .where('Transfer_Payment_Profile._deleted', '=', false)
        .select('Transfer_Payment_Profile.egcs_tp_agency as agency_id').executeTakeFirst()
      if (!budget) return { scope: { type: 'global' }, data: { missing: 'budget' as const } }
      const scope: Scope = { type: 'entity', agencyId: String(budget.agency_id), path: [
        { type: 'transfer_payment', id: profileId }, { type: 'transfer_payment_budget', id: budgetId }
      ] }
      return { scope, data: { agencyId: String(budget.agency_id), scope } }
    }
  )
  return data ?? null
}

/**
 * Authorizes an active stream-budget through its canonical profile and stream chain.
 *
 * @param event - Active request event.
 * @param action - Requested transfer-payment action.
 * @param profileId - Owning profile identifier.
 * @param streamId - Owning stream identifier.
 * @param streamBudgetId - Stream-budget identifier.
 * @returns Canonical stream-budget access context, or null for authorized absence.
 */
export const authorizeTransferPaymentStreamBudgetResource = async (
  event: H3Event, action: TransferPaymentAction, profileId: string, streamId: string, streamBudgetId: string
) => {
  const db = event.context.$db
  const { data } = await authorize<TransferPaymentAction, { agencyId: string, scope: Scope } | null>(
    event, 'transfer_payment', action, async () => {
      if (!isDatabaseId(profileId) || !isDatabaseId(streamId) || !isDatabaseId(streamBudgetId)) {
        return { scope: { type: 'global' }, data: null }
      }
      const row = await db.selectFrom('Transfer_Payment_Stream_Budget')
        .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream')
        .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
        .where('Transfer_Payment_Stream_Budget.id', '=', streamBudgetId)
        .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream', '=', streamId)
        .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
        .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
        .where('Transfer_Payment_Stream._deleted', '=', false)
        .where('Transfer_Payment_Profile._deleted', '=', false)
        .select('Transfer_Payment_Profile.egcs_tp_agency as agency_id').executeTakeFirst()
      if (!row) return { scope: { type: 'global' }, data: null }
      const scope: Scope = { type: 'entity', agencyId: String(row.agency_id), path: [
        { type: 'transfer_payment', id: profileId },
        { type: 'transfer_payment_stream', id: streamId },
        { type: 'transfer_payment_stream_budget', id: streamBudgetId }
      ] }
      return { scope, data: { agencyId: String(row.agency_id), scope } }
    }
  )
  return data ?? null
}

/**
 * Authorizes an active eligible-recipient link through its canonical stream chain.
 *
 * @param event - Active request event.
 * @param action - Requested transfer-payment action.
 * @param profileId - Owning profile identifier.
 * @param streamId - Owning stream identifier.
 * @param recipientId - Eligible-recipient link identifier.
 * @returns Canonical link access context, or null for authorized absence.
 */
export const authorizeTransferPaymentEligibleRecipientResource = async (
  event: H3Event, action: TransferPaymentAction, profileId: string, streamId: string, recipientId: string
) => {
  const db = event.context.$db
  const { data } = await authorize<TransferPaymentAction, { agencyId: string } | null>(
    event, 'transfer_payment', action, async () => {
      if (!isDatabaseId(profileId) || !isDatabaseId(streamId) || !isDatabaseId(recipientId)) {
        return { scope: { type: 'global' }, data: null }
      }
      const row = await db.selectFrom('Transfer_Payment_Stream_Eligible_Recipient')
        .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Stream_Eligible_Recipient.egcs_tp_transferpaymentstream')
        .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
        .where('Transfer_Payment_Stream_Eligible_Recipient.id', '=', recipientId)
        .where('Transfer_Payment_Stream_Eligible_Recipient.egcs_tp_transferpaymentstream', '=', streamId)
        .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
        .where('Transfer_Payment_Stream_Eligible_Recipient._deleted', '=', false)
        .where('Transfer_Payment_Stream._deleted', '=', false)
        .where('Transfer_Payment_Profile._deleted', '=', false)
        .select('Transfer_Payment_Profile.egcs_tp_agency as agency_id').executeTakeFirst()
      if (!row) return { scope: { type: 'global' }, data: null }
      const scope: Scope = { type: 'entity', agencyId: String(row.agency_id), path: [
        { type: 'transfer_payment', id: profileId }, { type: 'transfer_payment_stream', id: streamId },
        { type: 'transfer_payment_eligible_recipient', id: recipientId }
      ] }
      return { scope, data: { agencyId: String(row.agency_id) } }
    }
  )
  return data ?? null
}

/**
 * Authorizes an active stream cost-category line-item link without disclosing existence.
 *
 * @param event - Active request event.
 * @param action - Requested action.
 * @param profileId - Owning profile id.
 * @param streamId - Owning stream id.
 * @param lineItemId - Link id.
 * @returns Canonical access context, or null for authorized absence.
 */
export const authorizeTransferPaymentCostCategoryLineItemResource = async (
  event: H3Event, action: TransferPaymentAction, profileId: string, streamId: string, lineItemId: string
) => {
  const db = event.context.$db
  const { data } = await authorize<TransferPaymentAction, { agencyId: string } | null>(event, 'transfer_payment', action, async () => {
    if (!isDatabaseId(profileId) || !isDatabaseId(streamId) || !isDatabaseId(lineItemId)) {
      return { scope: { type: 'global' }, data: null }
    }
    const row = await db.selectFrom('Transfer_Payment_Stream_Cost_Category_Line_Item')
      .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_transferpaymentstream')
      .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
      .where('Transfer_Payment_Stream_Cost_Category_Line_Item.id', '=', lineItemId)
      .where('Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_transferpaymentstream', '=', streamId)
      .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
      .where('Transfer_Payment_Stream_Cost_Category_Line_Item._deleted', '=', false)
      .where('Transfer_Payment_Stream._deleted', '=', false).where('Transfer_Payment_Profile._deleted', '=', false)
      .select('Transfer_Payment_Profile.egcs_tp_agency as agency_id').executeTakeFirst()
    if (!row) return { scope: { type: 'global' }, data: null }
    return { scope: { type: 'entity', agencyId: String(row.agency_id), path: [
      { type: 'transfer_payment', id: profileId }, { type: 'transfer_payment_stream', id: streamId },
      { type: 'transfer_payment_cost_category_line_item', id: lineItemId }
    ] }, data: { agencyId: String(row.agency_id) } }
  })
  return data ?? null
}

/**
 * Builds the common transfer-payment scoped authorization resolver for route-level `authorize(...)` calls.
 *
 * @param action - The transfer payment action being authorized.
 * @param scope - The resolved transfer payment scope for the route.
 * @param _db - The Kysely database client retained for the shared route-helper contract.
 * @returns A resolver callback for `authorize(...)`.
 */
export const createTransferPaymentScopedAuthorizeHandler = (
  action: 'create' | 'read' | 'update' | 'delete',
  scope: Scope,
  _db: Kysely<Database>
): ((
  args: TransferPaymentAuthorizeHandlerArgs
) => Promise<TransferPaymentAuthorizeResolution>) => async ({ context }: TransferPaymentAuthorizeHandlerArgs) => {
  const canAccess = context.userAbilities.authorize(
    'transfer_payment',
    action,
    scope
  )

  if (canAccess) return { bypass: true as const }
  return { scope }
}
