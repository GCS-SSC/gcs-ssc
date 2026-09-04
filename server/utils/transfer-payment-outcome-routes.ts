import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import { badRequest, notFound } from './api-errors'
import { authorize, authorizeWithFreshAuthContext } from './authorize'
import { createTransferPaymentScopedAuthorizeHandler } from './transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentWrite } from './transfer-payment-write-transaction'
import type { Database } from '~~/shared/types/database'
import type { Scope } from '~~/shared/utils/scopes'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export interface TransferPaymentOutcomeIndicatorRouteContext {
  profileId: string
  outcomeId: string
  indicatorId: string
  agencyId: string
  scope: Scope
}

/**
 * Resolves a transfer payment outcome performance indicator mutation context.
 *
 * @param event - Active H3 event.
 * @param db - Database connection.
 * @param action - Mutation action whose exact canonical scope must be authorized.
 * @returns Route ids and authorization scope, or an API error response.
 */
export const prepareTransferPaymentOutcomeIndicatorRoute = async (
  event: H3Event,
  db: Kysely<Database>,
  action: 'update' | 'delete'
): Promise<TransferPaymentOutcomeIndicatorRouteContext | unknown> => {
  const profileId = getRouterParam(event, 'id')
  const outcomeId = getRouterParam(event, 'outcomeId')
  const indicatorId = getRouterParam(event, 'indicatorId')

  if (!profileId || !outcomeId || !indicatorId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  if (![profileId, outcomeId, indicatorId].every(isPositivePostgresBigintText)) {
    return await notFound(event, 'TRANSFER_PAYMENT_INDICATOR_NOT_FOUND', 'apiErrors.transfer_payment.performance_indicator_not_found')
  }

  const { data: routeContext } = await authorize<'update' | 'delete', TransferPaymentOutcomeIndicatorRouteContext | null>(
    event,
    'transfer_payment',
    action,
    async () => {
      const indicator = await db
        .selectFrom('Transfer_Payment_Outcome_Performance_Indicator')
        .innerJoin(
          'Transfer_Payment_Outcome',
          'Transfer_Payment_Outcome.id',
          'Transfer_Payment_Outcome_Performance_Indicator.egcs_tp_transferpaymentoutcome'
        )
        .innerJoin(
          'Transfer_Payment_Profile',
          'Transfer_Payment_Profile.id',
          'Transfer_Payment_Outcome.egcs_tp_transferpaymentprofile'
        )
        .where('Transfer_Payment_Outcome_Performance_Indicator.id', '=', indicatorId)
        .where('Transfer_Payment_Outcome_Performance_Indicator.egcs_tp_transferpaymentoutcome', '=', outcomeId)
        .where('Transfer_Payment_Outcome.egcs_tp_transferpaymentprofile', '=', profileId)
        .where('Transfer_Payment_Outcome_Performance_Indicator._deleted', '=', false)
        .where('Transfer_Payment_Outcome._deleted', '=', false)
        .where('Transfer_Payment_Profile._deleted', '=', false)
        .select(['Transfer_Payment_Profile.egcs_tp_agency as agency_id'])
        .executeTakeFirst()
      if (!indicator) return { scope: { type: 'global' }, data: null }
      const scope: Scope = {
        type: 'entity',
        agencyId: String(indicator.agency_id),
        path: [
          { type: 'transfer_payment', id: profileId },
          { type: 'transfer_payment_outcome', id: outcomeId },
          { type: 'transfer_payment_indicator', id: indicatorId }
        ]
      }
      return {
        scope,
        data: { profileId, outcomeId, indicatorId, agencyId: String(indicator.agency_id), scope }
      }
    }
  )

  if (!routeContext) {
    return await notFound(
      event,
      'TRANSFER_PAYMENT_INDICATOR_NOT_FOUND',
      'apiErrors.transfer_payment.performance_indicator_not_found'
    )
  }

  return routeContext
}

/**
 * Type guard for prepared performance indicator route context.
 *
 * @param value - Candidate route context.
 * @returns True when all ids and scope are available.
 */
export const isTransferPaymentOutcomeIndicatorRouteContext = (
  value: unknown
): value is TransferPaymentOutcomeIndicatorRouteContext => {
  return typeof value === 'object'
    && value !== null
    && 'profileId' in value
    && 'outcomeId' in value
    && 'indicatorId' in value
    && 'agencyId' in value
    && 'scope' in value
}

/**
 * Executes an outcome-indicator mutation after fresh exact-scope authorization and locked ownership revalidation.
 *
 * @param event - Active request event.
 * @param action - Requested mutation action.
 * @param routeContext - Canonical profile/outcome/indicator route context.
 * @param callback - Mutation executed only after current ownership and authorization are proven.
 * @returns Callback result.
 */
export const executeFreshAuthorizedTransferPaymentOutcomeIndicatorWrite = async <T>(
  event: H3Event,
  action: 'update' | 'delete',
  routeContext: TransferPaymentOutcomeIndicatorRouteContext,
  callback: (trx: Transaction<Database>) => Promise<T>
): Promise<T> => await executeFreshAuthorizedTransferPaymentWrite(
  event,
  event.context.$db,
  routeContext.profileId,
  routeContext.agencyId,
  action,
  async (trx, _current, authContext) => {
    const outcome = await trx
      .selectFrom('Transfer_Payment_Outcome')
      .select('id')
      .where('id', '=', routeContext.outcomeId)
      .where('egcs_tp_transferpaymentprofile', '=', routeContext.profileId)
      .where('_deleted', '=', false)
      .forUpdate('Transfer_Payment_Outcome')
      .executeTakeFirst()
    if (!outcome) {
      return await notFound(event, 'TRANSFER_PAYMENT_INDICATOR_NOT_FOUND', 'apiErrors.transfer_payment.performance_indicator_not_found')
    }

    const indicator = await trx
      .selectFrom('Transfer_Payment_Outcome_Performance_Indicator')
      .select('id')
      .where('id', '=', routeContext.indicatorId)
      .where('egcs_tp_transferpaymentoutcome', '=', routeContext.outcomeId)
      .where('_deleted', '=', false)
      .forUpdate('Transfer_Payment_Outcome_Performance_Indicator')
      .executeTakeFirst()
    if (!indicator) {
      return await notFound(event, 'TRANSFER_PAYMENT_INDICATOR_NOT_FOUND', 'apiErrors.transfer_payment.performance_indicator_not_found')
    }

    await authorizeWithFreshAuthContext(
      event,
      authContext,
      'transfer_payment',
      action,
      createTransferPaymentScopedAuthorizeHandler(action, routeContext.scope, trx)
    )
    return await callback(trx)
  }
)
