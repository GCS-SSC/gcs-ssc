/* eslint-disable jsdoc/require-jsdoc -- Existing exported forecast helpers are intentionally documented by their descriptive names. */
import { getRouterParam, type H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource, type AgreementScopeContext } from '~~/server/utils/agreement'
import { lockAgreementAggregate, lockAgreementAggregates, type AgreementAggregateLock } from '~~/server/utils/agreement-aggregate-lock'
import { assertAgreementExists } from '~~/server/utils/agreement-child-resources'
import type { AssignableEntityType, Database } from '~~/shared/types/database'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { authorizeFreshAssignedItem } from '~~/server/utils/authorize'
import { budgetFiscalYearStableId, budgetLineItemStableId } from '~~/server/utils/agreement-budget-lineage'
import type { ExactEntityTarget } from '@gcs-ssc/authorization'
import { assertBusinessStatusMutationAllowed, resolveBusinessStatusProtection } from '~~/server/utils/business-status-runtime'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

type AgreementForecastDb = Kysely<Database> | Transaction<Database>

export const lockAgreementForecastCohort = async (
  trx: Transaction<Database>,
  forecastId: string
) => {
  const candidate = await trx
    .selectFrom('Funding_Case_Agreement_Forecast')
    .select(['egcs_fc_fundingagreement', 'egcs_fc_fiscalyear'])
    .where('id', '=', forecastId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!candidate) return []

  return await trx
    .selectFrom('Funding_Case_Agreement_Forecast')
    .select('id')
    .where('egcs_fc_fundingagreement', '=', String(candidate.egcs_fc_fundingagreement))
    .where('egcs_fc_fiscalyear', '=', String(candidate.egcs_fc_fiscalyear))
    .where('_deleted', '=', false)
    .orderBy('id', 'asc')
    .forUpdate()
    .execute()
}

export const prepareAgreementForecastRoute = async (
  event: H3Event,
  action: 'create' | 'read' | 'update' | 'delete',
  assignmentTarget?: ExactEntityTarget<AssignableEntityType>
) => {
  const db = event.context.$db as Kysely<Database>
  const agreementId = getRouterParam(event, 'id')

  if (!agreementId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const agreementContext = await authorizeAgreementResource(event, action, agreementId, db, { assignmentTarget })
  if (!agreementContext) {
    return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  const agreement = await assertAgreementExists(event, agreementId, db)
  if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) {
    return agreement
  }

  return {
    agreementId,
    agreementContext,
    db
  }
}

export const assertAgreementForecastBudgetFiscalYear = async (
  event: H3Event,
  db: AgreementForecastDb,
  agreementId: string,
  budgetFiscalYearId: string
) => {
  if (!isPositivePostgresBigintText(budgetFiscalYearId)) {
    return await badRequest(event, 'INVALID_AGREEMENT_FORECAST_FISCAL_YEAR', 'apiErrors.agreement.invalid_forecast_fiscal_year')
  }
  const fiscalYear = await db
    .selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
    .innerJoin(
      'Funding_Case_Agreement_Budget_Version',
      'Funding_Case_Agreement_Budget_Version.id',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion'
    )
    .where(budgetFiscalYearStableId, '=', budgetFiscalYearId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .select(budgetFiscalYearStableId.as('id'))
    .executeTakeFirst()

  if (!fiscalYear) {
    return await badRequest(event, 'INVALID_AGREEMENT_FORECAST_FISCAL_YEAR', 'apiErrors.agreement.invalid_forecast_fiscal_year')
  }

  return fiscalYear
}

export const assertAgreementForecastExists = async (
  event: H3Event,
  db: AgreementForecastDb,
  agreementId: string,
  forecastId: string
) => {
  const forecast = await db
    .selectFrom('Funding_Case_Agreement_Forecast')
    .where('id', '=', forecastId)
    .where('egcs_fc_fundingagreement', '=', agreementId)
    .where('_deleted', '=', false)
    .select(['id', 'egcs_fc_fiscalyear', 'egcs_fc_status'])
    .executeTakeFirst()

  if (!forecast) {
    return await badRequest(event, 'AGREEMENT_FORECAST_NOT_FOUND', 'apiErrors.agreement.forecast_not_found')
  }

  return forecast
}

export const assertAgreementForecastEditable = async (
  event: H3Event,
  db: AgreementForecastDb,
  agreementId: string,
  forecastId: string
) => {
  const forecast = await assertAgreementForecastExists(event, db, agreementId, forecastId)
  if (!forecast || typeof forecast !== 'object' || !('id' in forecast)) {
    return forecast
  }

  const protection = await resolveBusinessStatusProtection(db, 'fundingcaseforecast', forecastId)
  if (!protection || protection.locked) {
    return await badRequest(event, 'AGREEMENT_FORECAST_LOCKED', 'apiErrors.request.invalid_status')
  }

  return forecast
}

export const lockAgreementForecastForUpdate = async (
  trx: Transaction<Database>,
  forecastId: string
) => {
  return await lockAgreementAggregate(trx, 'forecast', forecastId)
}

export const lockAgreementForecastEditable = async (
  event: H3Event,
  trx: Transaction<Database>,
  agreementId: string,
  forecastId: string
) => {
  await lockAgreementForecastForUpdate(trx, forecastId)
  return await assertAgreementForecastEditable(event, trx, agreementId, forecastId)
}

export const executeAgreementForecastMutation = async <T>(
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  initialContext: AgreementScopeContext,
  aggregateLocks: AgreementAggregateLock[] | ((trx: Transaction<Database>) => Promise<AgreementAggregateLock[]>),
  callback: (trx: Transaction<Database>) => Promise<T>,
  options: { action?: 'create' | 'update' | 'delete' } = {}
): Promise<T> => {
  return await executeFreshAuthorizedAgreementWrite(
    event,
    db,
    agreementId,
    initialContext,
    async trx => await callback(trx),
    {
      authorize: async (trx, _agreementContext, authContext) => {
        const locks = typeof aggregateLocks === 'function' ? await aggregateLocks(trx) : aggregateLocks
        await lockAgreementAggregates(trx, locks, agreementId)
        for (const lock of locks.filter(lock => lock.type === 'forecast')) {
          await assertBusinessStatusMutationAllowed(event, trx, 'fundingcaseforecast', lock.id)
          await authorizeFreshAssignedItem(event, trx, authContext, 'fundingcaseforecast', lock.id, options.action ?? 'update')
        }
      }
    }
  )
}

export const assertAgreementForecastBudgetLineItem = async (
  event: H3Event,
  db: AgreementForecastDb,
  agreementId: string,
  forecastFiscalYearId: string,
  budgetLineItemId: string
) => {
  if (!isPositivePostgresBigintText(forecastFiscalYearId) || !isPositivePostgresBigintText(budgetLineItemId)) {
    return await badRequest(event, 'INVALID_AGREEMENT_FORECAST_BUDGET_LINE_ITEM', 'apiErrors.agreement.invalid_forecast_budget_line_item')
  }
  const lineItem = await db
    .selectFrom('Funding_Case_Agreement_Budget_Line_Item')
    .innerJoin(
      'Funding_Case_Agreement_Budget_Fiscal_Year',
      'Funding_Case_Agreement_Budget_Fiscal_Year.id',
      'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear'
    )
    .innerJoin(
      'Funding_Case_Agreement_Budget_Version',
      'Funding_Case_Agreement_Budget_Version.id',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion'
    )
    .where(budgetLineItemStableId, '=', budgetLineItemId)
    .where(budgetFiscalYearStableId, '=', forecastFiscalYearId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .select(budgetLineItemStableId.as('id'))
    .executeTakeFirst()

  if (!lineItem) {
    return await badRequest(event, 'INVALID_AGREEMENT_FORECAST_BUDGET_LINE_ITEM', 'apiErrors.agreement.invalid_forecast_budget_line_item')
  }

  return lineItem
}

export type AgreementForecastRuntimeContext = {
  forecastId: string
  agreementId: string
  streamId: string
  agencyId: string
}

export const resolveAgreementForecastRuntimeContext = async (
  db: AgreementForecastDb,
  forecastId: string
): Promise<AgreementForecastRuntimeContext | null> => {
  if (!isPositivePostgresBigintText(forecastId)) return null
  const row = await db
    .selectFrom('Funding_Case_Agreement_Forecast')
    .innerJoin(
      'Funding_Case_Agreement_Profile',
      'Funding_Case_Agreement_Profile.id',
      'Funding_Case_Agreement_Forecast.egcs_fc_fundingagreement'
    )
    .innerJoin(
      'Transfer_Payment_Stream',
      'Transfer_Payment_Stream.id',
      'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream'
    )
    .innerJoin(
      'Transfer_Payment_Profile',
      'Transfer_Payment_Profile.id',
      'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
    )
    .select([
      'Funding_Case_Agreement_Forecast.id as forecast_id',
      'Funding_Case_Agreement_Forecast.egcs_fc_fundingagreement as agreement_id',
      'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream as stream_id',
      'Transfer_Payment_Profile.egcs_tp_agency as agency_id'
    ])
    .where('Funding_Case_Agreement_Forecast.id', '=', forecastId)
    .where('Funding_Case_Agreement_Forecast._deleted', '=', false)
    .where('Funding_Case_Agreement_Profile._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .executeTakeFirst()

  if (!row?.forecast_id || !row.agreement_id || !row.stream_id || !row.agency_id) {
    return null
  }

  return {
    forecastId: String(row.forecast_id),
    agreementId: String(row.agreement_id),
    streamId: String(row.stream_id),
    agencyId: String(row.agency_id)
  }
}
