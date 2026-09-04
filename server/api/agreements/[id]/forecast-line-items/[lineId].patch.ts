/* eslint-disable jsdoc/require-jsdoc -- Route-local validation helpers are self-descriptive and not public API. */
import { sql, type Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AgreementScopeContext } from '~~/server/utils/agreement'
import { FundingCaseAgreementForecastLineItemPatchSchema } from '~~/shared/types/schemas'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { badRequest } from '~~/server/utils/api-errors'
import { resolveForecastLineAssignmentTarget } from '~~/server/utils/agreement-assignment-target'
import {
  assertAgreementForecastBudgetLineItem,
  assertAgreementForecastEditable,
  executeAgreementForecastMutation,
  prepareAgreementForecastRoute
} from '~~/server/utils/agreement-forecast'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'

type ForecastLineItemExisting = {
  id: string
  egcs_fc_agreementforecast: string
  egcs_fc_fundingagreementbudgetlineitem: string
  forecast_fiscalyear: string
}

const loadForecastLineItemForPatch = async (
  db: Kysely<Database>,
  agreementId: string,
  lineId: string
) => {
  const row = await db
    .selectFrom('Funding_Case_Agreement_Forecast_Line_Item')
    .innerJoin(
      'Funding_Case_Agreement_Forecast',
      'Funding_Case_Agreement_Forecast.id',
      'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_agreementforecast'
    )
    .where('Funding_Case_Agreement_Forecast_Line_Item.id', '=', lineId)
    .where('Funding_Case_Agreement_Forecast.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Forecast_Line_Item._deleted', '=', false)
    .where('Funding_Case_Agreement_Forecast._deleted', '=', false)
    .select([
      'Funding_Case_Agreement_Forecast_Line_Item.id as id',
      'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_agreementforecast as egcs_fc_agreementforecast',
      'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_fundingagreementbudgetlineitem as egcs_fc_fundingagreementbudgetlineitem',
      'Funding_Case_Agreement_Forecast.egcs_fc_fiscalyear as forecast_fiscalyear'
    ])
    .executeTakeFirst()

  return row as ForecastLineItemExisting | undefined
}

const validateForecastPatchForecast = async (
  event: Parameters<typeof readValidatedBodyI18n>[0],
  db: Kysely<Database>,
  agreementId: string,
  existing: ForecastLineItemExisting,
  patchValues: Record<string, unknown>
) => {
  const nextForecastId = String(patchValues.egcs_fc_agreementforecast ?? existing.egcs_fc_agreementforecast)
  const nextForecast = await assertAgreementForecastEditable(event, db, agreementId, nextForecastId)
  if (!nextForecast || typeof nextForecast !== 'object' || !('id' in nextForecast) || !('egcs_fc_fiscalyear' in nextForecast)) {
    return nextForecast
  }

  return nextForecast
}

const validateForecastPatchBudgetLineItem = async (
  event: Parameters<typeof readValidatedBodyI18n>[0],
  db: Kysely<Database>,
  agreementId: string,
  existing: ForecastLineItemExisting,
  patchValues: Record<string, unknown>,
  forecastFiscalYearId: string
) => {
  const nextBudgetLineItemId = String(
    patchValues.egcs_fc_fundingagreementbudgetlineitem ?? existing.egcs_fc_fundingagreementbudgetlineitem
  )
  const budgetLineItem = await assertAgreementForecastBudgetLineItem(
    event,
    db,
    agreementId,
    forecastFiscalYearId,
    nextBudgetLineItemId
  )
  if (!budgetLineItem || typeof budgetLineItem !== 'object' || !('id' in budgetLineItem)) {
    return budgetLineItem
  }

  return budgetLineItem
}

const patchForecastLineItemForRoute = async (
  event: Parameters<typeof readValidatedBodyI18n>[0],
  db: Kysely<Database>,
  agreementId: string,
  initialContext: AgreementScopeContext,
  lineId: string
) => {
  const existingLine = await loadForecastLineItemForPatch(db, agreementId, lineId)
  if (!existingLine) {
    return await badRequest(event, 'AGREEMENT_FORECAST_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.forecast_line_item_not_found')
  }

  const patchValues = await readValidatedBodyI18n(event, FundingCaseAgreementForecastLineItemPatchSchema)
  return await executeAgreementForecastMutation(event, db, agreementId, initialContext, async trx => {
    const child = await trx.selectFrom('Funding_Case_Agreement_Forecast_Line_Item').select('egcs_fc_agreementforecast').where('id', '=', lineId).where('_deleted', '=', false).executeTakeFirst()
    if (!child) return []
    return [
      { type: 'forecast', id: String(child.egcs_fc_agreementforecast) },
      { type: 'forecast', id: String(patchValues.egcs_fc_agreementforecast ?? child.egcs_fc_agreementforecast) }
    ]
  }, async trx => {
    const existing = await loadForecastLineItemForPatch(trx, agreementId, lineId)

    if (!existing) {
      return await badRequest(event, 'AGREEMENT_FORECAST_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.forecast_line_item_not_found')
    }

    const editable = await assertAgreementForecastEditable(event, trx, agreementId, existing.egcs_fc_agreementforecast)
    if (!editable || typeof editable !== 'object' || !('id' in editable)) return editable
    const nextForecast = await validateForecastPatchForecast(event, trx, agreementId, existing, patchValues)
    if (!nextForecast || typeof nextForecast !== 'object' || !('egcs_fc_fiscalyear' in nextForecast)) {
      return nextForecast
    }

    const budgetLineItem = await validateForecastPatchBudgetLineItem(
      event,
      trx,
      agreementId,
      existing,
      patchValues,
      String(nextForecast.egcs_fc_fiscalyear)
    )
    if (!budgetLineItem || typeof budgetLineItem !== 'object' || !('id' in budgetLineItem)) {
      return budgetLineItem
    }

    const { egcs_fc_amount: patchAmount, ...nonMoneyPatchValues } = patchValues
    const databasePatchValues = {
      ...nonMoneyPatchValues,
      ...(patchAmount === undefined
        ? {}
        : { egcs_fc_amount: databaseMoneyValue(patchAmount) })
    }

    const updated = await trx
      .updateTable('Funding_Case_Agreement_Forecast_Line_Item')
      .set(databasePatchValues)
      .where('id', '=', lineId)
      .where('egcs_fc_agreementforecast', '=', existing.egcs_fc_agreementforecast)
      .where('_deleted', '=', false)
      .returning([
        'id',
        'egcs_fc_agreementforecast',
        'egcs_fc_fundingagreement',
        'egcs_fc_fundingagreementbudgetlineitem',
        'egcs_fc_month',
        databaseMoneyText(sql.ref('egcs_fc_amount')).as('egcs_fc_amount'),
        'egcs_fc_currency',
        'egcs_fc_version',
        '_deleted'
      ])
      .executeTakeFirstOrThrow()
    return { ...updated, egcs_fc_amount: parseDatabaseMoney(updated.egcs_fc_amount) }
  })
}

export default defineEventHandler(async event => {
  const lineId = getRouterParam(event, 'lineId')
  if (!lineId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(lineId)) {
    return await badRequest(event, 'AGREEMENT_FORECAST_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.forecast_line_item_not_found')
  }

  const assignmentTarget = await resolveForecastLineAssignmentTarget(event.context.$db, lineId)
  if (!assignmentTarget) return await badRequest(event, 'AGREEMENT_FORECAST_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.forecast_line_item_not_found')
  const prepared = await prepareAgreementForecastRoute(event, 'update', assignmentTarget)
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  return await patchForecastLineItemForRoute(event, db, agreementId, agreementContext, lineId)
})
