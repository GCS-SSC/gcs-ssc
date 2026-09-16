import { sql } from 'kysely'

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
