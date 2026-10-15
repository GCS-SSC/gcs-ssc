import { sql, type Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

/** Stable public identifier for a budget fiscal-year row across version copies. */
export const budgetFiscalYearStableId = sql<string>`COALESCE(
  ${sql.ref('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_originalbudgetfiscalyear')},
  ${sql.ref('Funding_Case_Agreement_Budget_Fiscal_Year.id')}
)`

/** Stable public identifier for a budget line-item row across version copies. */
export const budgetLineItemStableId = sql<string>`COALESCE(
  ${sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_originalbudgetlineitem')},
  ${sql.ref('Funding_Case_Agreement_Budget_Line_Item.id')}
)`

/**
 * Resolves retained physical identities but always validates a live current counterpart.
 * @param db Agreement write database.
 * @param agreementId Owning Agreement.
 * @param fiscalYearId Stored physical or stable fiscal-year identity.
 * @param lineId Stored physical reference or new stable selection.
 * @param referenceMode Whether an unchanged stored reference is being validated.
 * @returns The unchanged reference or valid current stable selection, if available.
 */
export const readAgreementBudgetLineReference = async (
  db: Kysely<Database>,
  agreementId: string,
  fiscalYearId: string,
  lineId: string,
  referenceMode: 'current-choice' | 'retained-existing'
): Promise<{ id: string } | undefined> => {
  if (![agreementId, fiscalYearId, lineId].every(isPositivePostgresBigintText)) return undefined
  const sourceYear = await db.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
    .select(budgetFiscalYearStableId.as('id'))
    .where('id', '=', fiscalYearId)
    .where('egcs_fc_fundingagreement', '=', agreementId)
    .executeTakeFirst()
  if (!sourceYear) return undefined

  let stableLineId = lineId
  if (referenceMode === 'retained-existing') {
    const sourceLine = await db.selectFrom('Funding_Case_Agreement_Budget_Line_Item')
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year', 'Funding_Case_Agreement_Budget_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear')
      .select(budgetLineItemStableId.as('id'))
      .where('Funding_Case_Agreement_Budget_Line_Item.id', '=', lineId)
      .where('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
      .where(budgetFiscalYearStableId, '=', sourceYear.id)
      .executeTakeFirst()
    if (!sourceLine) return undefined
    stableLineId = String(sourceLine.id)
  }

  const currentLine = await db.selectFrom('Funding_Case_Agreement_Budget_Line_Item')
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year', 'Funding_Case_Agreement_Budget_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear')
    .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
    .where(budgetLineItemStableId, '=', stableLineId)
    .where(budgetFiscalYearStableId, '=', sourceYear.id)
    .where('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .select(budgetLineItemStableId.as('id'))
    .executeTakeFirst()
  return currentLine ? { id: referenceMode === 'retained-existing' ? lineId : String(currentLine.id) } : undefined
}
