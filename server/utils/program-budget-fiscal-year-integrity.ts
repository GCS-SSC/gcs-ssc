import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'

/**
 * Checks business-year references while the caller holds the Program Budget row lock.
 *
 * @param trx - The authorized Program write transaction.
 * @param budgetId - The locked Program Budget identity.
 * @param fiscalYearId - Its persisted fiscal year before reassignment.
 * @returns Whether a current or open-amendment Agreement budget depends on that year.
 */
export const isProgramBudgetFiscalYearInUse = async (
  trx: Transaction<Database>,
  budgetId: string,
  fiscalYearId: string
): Promise<boolean> => {
  const allocations = await trx.selectFrom('Transfer_Payment_Stream_Budget')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream')
    .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget', '=', budgetId)
    .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .select('Transfer_Payment_Stream.id')
    .execute()
  if (!allocations.length) return false

  // Current years and open amendment snapshots can receive new lines. Closed
  // historical snapshots alone are not a live funding dependency.
  const reference = await trx.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
    .innerJoin('Funding_Case_Agreement_Profile', 'Funding_Case_Agreement_Profile.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement')
    .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
    .leftJoin('Funding_Case_Agreement_Amendment', 'Funding_Case_Agreement_Amendment.id', 'Funding_Case_Agreement_Budget_Version.egcs_fc_amendment')
    .where('Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream', 'in', allocations.map(row => String(row.id)))
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear', '=', fiscalYearId)
    .where('Funding_Case_Agreement_Profile._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .where(eb => eb.or([
      eb('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true),
      eb.and([
        eb('Funding_Case_Agreement_Amendment._deleted', '=', false),
        eb('Funding_Case_Agreement_Amendment.egcs_fc_isopen', '=', true)
      ])
    ]))
    .select('Funding_Case_Agreement_Budget_Fiscal_Year.id')
    .limit(1)
    .executeTakeFirst()
  return Boolean(reference)
}
