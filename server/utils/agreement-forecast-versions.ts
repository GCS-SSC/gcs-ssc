import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'

/**
 * Allocates the next header version under the caller's Agreement write lock, retaining deleted history.
 * @param trx - Authorized transaction holding the Agreement write lock.
 * @param agreementId - Owning Agreement identifier.
 * @param fiscalYearId - Stable budget fiscal-year identity.
 * @returns Next server-assigned version as exact bigint text.
 */
export const nextAgreementForecastVersion = async (
  trx: Transaction<Database>,
  agreementId: string,
  fiscalYearId: string
): Promise<string> => {
  const row = (await sql<{ version: string }>`
    SELECT (COALESCE(MAX(forecast.egcs_fc_version), -1) + 1)::text AS version
    FROM "Funding_Case_Agreement_Forecast" forecast
    JOIN "Funding_Case_Agreement_Budget_Fiscal_Year" year ON year.id = forecast.egcs_fc_fiscalyear
    WHERE forecast.egcs_fc_fundingagreement = ${agreementId}::bigint
      AND year.egcs_fc_fundingagreement = ${agreementId}::bigint
      AND COALESCE(year.egcs_fc_originalbudgetfiscalyear, year.id) = ${fiscalYearId}::bigint
  `.execute(trx)).rows[0]
  if (!row) throw new Error('Forecast version allocation failed.')
  return row.version
}

/**
 * Copies the active Forecast's live breakdown exactly into an independently assigned draft.
 * @param trx - Authorized transaction holding the Agreement write lock.
 * @param agreementId - Owning Agreement identifier.
 * @param fiscalYearId - Stable budget fiscal-year identity.
 * @param forecastId - Newly inserted inactive draft Forecast.
 */
export const copyActiveAgreementForecastLines = async (
  trx: Transaction<Database>,
  agreementId: string,
  fiscalYearId: string,
  forecastId: string
): Promise<void> => {
  const active = (await sql<{ id: string }>`
    SELECT forecast.id::text AS id FROM "Funding_Case_Agreement_Forecast" forecast
    JOIN "Funding_Case_Agreement_Budget_Fiscal_Year" year ON year.id = forecast.egcs_fc_fiscalyear
    WHERE forecast.egcs_fc_fundingagreement = ${agreementId}::bigint
      AND year.egcs_fc_fundingagreement = ${agreementId}::bigint
      AND COALESCE(year.egcs_fc_originalbudgetfiscalyear, year.id) = ${fiscalYearId}::bigint
      AND forecast.egcs_fc_active AND NOT forecast._deleted
    ORDER BY forecast.id DESC LIMIT 1
  `.execute(trx)).rows[0]
  if (!active) return
  const sourceLines = await trx.selectFrom('Funding_Case_Agreement_Forecast_Line_Item')
    .select('id').where('egcs_fc_agreementforecast', '=', active.id).where('_deleted', '=', false)
    .orderBy('id', 'asc').execute()
  for (const source of sourceLines) {
    const copied = (await sql<{ id: string }>`
      INSERT INTO "Funding_Case_Agreement_Forecast_Line_Item"
        (egcs_fc_agreementforecast, egcs_fc_fundingagreement, egcs_fc_fundingagreementbudgetlineitem,
          egcs_fc_month, egcs_fc_amount, egcs_fc_totalamount, egcs_fc_currency)
      SELECT ${forecastId}::bigint, ${agreementId}::bigint, egcs_fc_fundingagreementbudgetlineitem,
        egcs_fc_month, egcs_fc_amount, egcs_fc_totalamount, egcs_fc_currency
      FROM "Funding_Case_Agreement_Forecast_Line_Item" WHERE id = ${source.id}::bigint
      RETURNING id::text AS id
    `.execute(trx)).rows[0]
    if (!copied) throw new Error('Forecast line copy failed.')
    await sql`
      INSERT INTO "Funding_Case_Agreement_Forecast_Line_Item_Funding"
        (egcs_fc_forecastlineitem, egcs_fc_fundingsubtype, egcs_fc_amount)
      SELECT ${copied.id}::bigint, egcs_fc_fundingsubtype, egcs_fc_amount
      FROM "Funding_Case_Agreement_Forecast_Line_Item_Funding"
      WHERE egcs_fc_forecastlineitem = ${source.id}::bigint AND NOT _deleted
    `.execute(trx)
  }
}

/**
 * Checks permanent Forecast numbering history before changing or removing a budget fiscal year.
 * @param db - Locked Agreement write transaction.
 * @param agreementId - Owning Agreement identifier.
 * @param fiscalYearId - Stable budget fiscal-year identity.
 * @returns Whether any Forecast, including deleted history, belongs to this fiscal year.
 */
export const hasAgreementFiscalYearForecastHistory = async (
  db: Kysely<Database> | Transaction<Database>,
  agreementId: string,
  fiscalYearId: string
): Promise<boolean> => Boolean(await db
  .selectFrom('Funding_Case_Agreement_Forecast')
  .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year',
    'Funding_Case_Agreement_Budget_Fiscal_Year.id', 'Funding_Case_Agreement_Forecast.egcs_fc_fiscalyear')
  .select('Funding_Case_Agreement_Forecast.id')
  .where('Funding_Case_Agreement_Forecast.egcs_fc_fundingagreement', '=', agreementId)
  .where(sql<string>`COALESCE(${sql.ref('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_originalbudgetfiscalyear')}, ${sql.ref('Funding_Case_Agreement_Budget_Fiscal_Year.id')})`, '=', fiscalYearId)
  .executeTakeFirst())

/**
 * Protects Forecast year identity when an approved amendment replaces the current budget.
 * @param trx - Authorized promotion transaction holding the Agreement lock.
 * @param agreementId - Owning Agreement identifier.
 * @param budgetVersionId - Approved snapshot about to supply the new current budget.
 * @returns Whether all permanent Forecast fiscal-year identities remain in the proposed budget.
 */
export const agreementForecastYearsRetained = async (
  trx: Transaction<Database>,
  agreementId: string,
  budgetVersionId: string
): Promise<boolean> => {
  const violation = (await sql<{ id: string }>`
    SELECT forecast.id::text AS id FROM "Funding_Case_Agreement_Forecast" forecast
    JOIN "Funding_Case_Agreement_Budget_Fiscal_Year" source_year ON source_year.id = forecast.egcs_fc_fiscalyear
    WHERE forecast.egcs_fc_fundingagreement = ${agreementId}::bigint
      AND NOT EXISTS (
        SELECT 1 FROM "Funding_Case_Agreement_Budget_Fiscal_Year" proposed_year
        WHERE proposed_year.egcs_fc_budgetversion = ${budgetVersionId}::bigint
          AND proposed_year.egcs_fc_fundingagreement = ${agreementId}::bigint AND NOT proposed_year._deleted
          AND COALESCE(proposed_year.egcs_fc_originalbudgetfiscalyear, proposed_year.id)
            = COALESCE(source_year.egcs_fc_originalbudgetfiscalyear, source_year.id)
          AND proposed_year.egcs_fc_fiscalyear = source_year.egcs_fc_fiscalyear
      )
    LIMIT 1
  `.execute(trx)).rows[0]
  return !violation
}
