import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { badRequest } from '~~/server/utils/api-errors'

/**
 * Rejects deleting a fiscal year referenced by a nondeleted financial record.
 * @param event - The authorized deletion request.
 * @param trx - The transaction holding the Agency and fiscal-year locks.
 * @param fiscalYearId - The locked fiscal-year identity.
 * @returns Resolves when no financial reference remains; otherwise throws.
 */
export const assertAgencyFiscalYearNotInUse = async (
  event: H3Event,
  trx: Transaction<Database>,
  fiscalYearId: string
) => {
  // The caller holds the Agency and fiscal-year locks. Do not lock referencing
  // casework rows here: their writers may already hold those rows before the FY.
  const programBudget = await trx.selectFrom('Transfer_Payment_Fiscal_Year_Budget')
    .select('id').where('egcs_tp_fiscalyear', '=', fiscalYearId)
    .where('_deleted', '=', false).executeTakeFirst()
  const agreementBudget = programBudget
    ? undefined
    : await trx.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
        .select('id').where('egcs_fc_fiscalyear', '=', fiscalYearId)
        .where('_deleted', '=', false).executeTakeFirst()
  const monitor = programBudget || agreementBudget
    ? undefined
    : await trx.selectFrom('Funding_Case_Agreement_Monitor')
        .select('id').where('egcs_fc_tentativefiscalyear', '=', fiscalYearId)
        .where('_deleted', '=', false).executeTakeFirst()

  if (programBudget || agreementBudget || monitor) {
    return await badRequest(event, 'AGENCY_FISCAL_YEAR_IN_USE', 'apiErrors.agency.fiscal_year_in_use')
  }
}
