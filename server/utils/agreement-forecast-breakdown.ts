import type { H3Event } from 'h3'
import { sql, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { FundingCaseAgreementForecastBreakdownPatch } from '~~/shared/types/schemas'
import { isNumeric19Money, sumMoney } from '~~/shared/utils/money'
import { badRequest, throwApiError } from './api-errors'
import { assertAgreementCurrency } from './agreement-currency'
import { budgetLineItemStableId } from './agreement-budget-lineage'
import { assertAgreementForecastBudgetLineItem, assertAgreementForecastEditable } from './agreement-forecast'
import { assertAgreementFinancialBudgetControls } from './agreement-financial-budget-controls'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { replaceAgreementLineFunding, type AgreementFundingSourceInput } from './agreement-funding-breakdown'

/**
 * Saves changed monthly cells under the caller's fresh Agreement/Forecast locks.
 * @param event - Request carrying the localized error context.
 * @param trx - Authorized transaction locking the owning Agreement and Forecast.
 * @param agreementId - Owning Agreement identifier.
 * @param forecastId - Exact assigned Forecast identifier.
 * @param changes - Validated changed cells and their last observed identities.
 * @returns Canonical persisted identities and exact amounts for the changed cells.
 */
export const saveAgreementForecastBreakdown = async (
  event: H3Event,
  trx: Transaction<Database>,
  agreementId: string,
  forecastId: string,
  changes: FundingCaseAgreementForecastBreakdownPatch
) => {
  const forecast = await assertAgreementForecastEditable(event, trx, agreementId, forecastId)
  const currency = await assertAgreementCurrency(event, trx, agreementId)
  const existingRows = await trx.selectFrom('Funding_Case_Agreement_Forecast_Line_Item')
    .innerJoin('Funding_Case_Agreement_Budget_Line_Item',
      'Funding_Case_Agreement_Budget_Line_Item.id',
      'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_fundingagreementbudgetlineitem')
    .select([
      'Funding_Case_Agreement_Forecast_Line_Item.id',
      'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_fundingagreementbudgetlineitem',
      'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_month',
      'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_currency',
      budgetLineItemStableId.as('stable_budget_line_id'),
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_amount')).as('egcs_fc_amount')
    ])
    .where('Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_agreementforecast', '=', forecastId)
    .where('Funding_Case_Agreement_Forecast_Line_Item._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreement', '=', agreementId)
    .execute()
  const fundingRows = await trx.selectFrom('Funding_Case_Agreement_Forecast_Line_Item_Funding')
    .innerJoin('Funding_Case_Agreement_Forecast_Line_Item',
      'Funding_Case_Agreement_Forecast_Line_Item.id',
      'Funding_Case_Agreement_Forecast_Line_Item_Funding.egcs_fc_forecastlineitem')
    .select([
      'Funding_Case_Agreement_Forecast_Line_Item_Funding.egcs_fc_forecastlineitem',
      'Funding_Case_Agreement_Forecast_Line_Item_Funding.egcs_fc_fundingsubtype',
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Forecast_Line_Item_Funding.egcs_fc_amount')).as('egcs_fc_amount')
    ])
    .where('Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_agreementforecast', '=', forecastId)
    .where('Funding_Case_Agreement_Forecast_Line_Item._deleted', '=', false)
    .where('Funding_Case_Agreement_Forecast_Line_Item_Funding._deleted', '=', false)
    .execute()
  const rowsByCell = new Map<string, typeof existingRows>()
  for (const row of existingRows) {
    const key = `${row.stable_budget_line_id}:${row.egcs_fc_month}`
    const occupants = rowsByCell.get(key) ?? []
    occupants.push(row)
    rowsByCell.set(key, occupants)
  }
  const fundingByLine = new Map<string, AgreementFundingSourceInput[]>()
  for (const row of fundingRows) {
    const key = String(row.egcs_fc_forecastlineitem)
    const amounts = fundingByLine.get(key) ?? []
    amounts.push({ egcs_fc_fundingsubtype: String(row.egcs_fc_fundingsubtype), egcs_fc_amount: parseDatabaseMoney(row.egcs_fc_amount) })
    fundingByLine.set(key, amounts)
  }
  const references = new Map<string, { id: string }>()
  const savedCells = []

  for (const cell of changes.cells) {
    const occupants = rowsByCell.get(`${cell.egcs_fc_fundingagreementbudgetlineitem}:${cell.egcs_fc_month}`) ?? []
    const existing = occupants[0]
    const existingSources = existing ? fundingByLine.get(String(existing.id)) ?? [] : []
    const expectedSources = cell.expected?.egcs_fc_fundingsources
    if (occupants.length > 1 || (cell.expected === null
      ? existing !== undefined
      : !existing || String(existing.id) !== cell.expected.id
        || parseDatabaseMoney(existing.egcs_fc_amount) !== cell.expected.egcs_fc_amount)
      || (cell.egcs_fc_fundingsources !== undefined && cell.expected !== null
        && (!expectedSources || existingSources.length !== expectedSources.length
          || existingSources.some(source => !expectedSources.some(expected => expected.egcs_fc_fundingsubtype === source.egcs_fc_fundingsubtype
            && expected.egcs_fc_amount === source.egcs_fc_amount))))) {
      return await throwApiError(event, {
        statusCode: 409,
        code: 'AGREEMENT_FORECAST_BREAKDOWN_CONFLICT',
        key: 'apiErrors.agreement.forecast_breakdown_conflict'
      })
    }
    const referenceMode = existing ? 'retained-existing' : 'current-choice'
    const referenceId = existing ? String(existing.egcs_fc_fundingagreementbudgetlineitem) : cell.egcs_fc_fundingagreementbudgetlineitem
    const referenceKey = `${referenceMode}:${referenceId}`
    let reference = references.get(referenceKey)
    if (!reference) {
      reference = await assertAgreementForecastBudgetLineItem(
        event, trx, agreementId, String(forecast.egcs_fc_fiscalyear), referenceId, { referenceMode }
      )
      references.set(referenceKey, reference)
    }
    if (existing && existing.egcs_fc_currency !== currency) {
      return await badRequest(event, 'AGREEMENT_CURRENCY_MISMATCH', 'apiErrors.agreement.currency_mismatch')
    }
    const total = sumMoney([
      cell.egcs_fc_amount,
      ...(cell.egcs_fc_fundingsources ?? existingSources).map(source => source.egcs_fc_amount)
    ])
    if (!isNumeric19Money(total)) {
      return await badRequest(event, 'AGREEMENT_FUNDING_TOTAL_MISMATCH', 'apiErrors.agreement.funding_breakdown_required')
    }
    const values = {
      egcs_fc_amount: databaseMoneyValue(cell.egcs_fc_amount),
      egcs_fc_totalamount: databaseMoneyValue(total)
    }
    const saved = existing
      ? await trx.updateTable('Funding_Case_Agreement_Forecast_Line_Item').set(values)
          .where('id', '=', String(existing.id)).where('egcs_fc_agreementforecast', '=', forecastId)
          .where('_deleted', '=', false).returning('id').executeTakeFirstOrThrow()
      : await trx.insertInto('Funding_Case_Agreement_Forecast_Line_Item').values({
          ...values,
          egcs_fc_agreementforecast: forecastId,
          egcs_fc_fundingagreementbudgetlineitem: String(reference.id),
          egcs_fc_month: cell.egcs_fc_month,
          egcs_fc_currency: currency
        }).returning('id').executeTakeFirstOrThrow()
    if (cell.egcs_fc_fundingsources !== undefined) {
      await replaceAgreementLineFunding(event, trx, agreementId, { kind: 'forecast', lineId: String(saved.id) }, cell.egcs_fc_fundingsources)
    }
    savedCells.push({
      id: String(saved.id),
      egcs_fc_fundingagreementbudgetlineitem: cell.egcs_fc_fundingagreementbudgetlineitem,
      egcs_fc_month: cell.egcs_fc_month,
      egcs_fc_amount: cell.egcs_fc_amount,
      egcs_fc_totalamount: total
    })
  }
  // Intermediate month totals may exceed the cap during an otherwise valid transfer.
  await assertAgreementFinancialBudgetControls(trx, agreementId, { kind: 'forecast', id: forecastId })
  return { cells: savedCells }
}
