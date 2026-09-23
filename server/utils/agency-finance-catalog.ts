import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'

/**
 * Finds a chart that the Stream may link through a live fiscal-year budget.
 *
 * @param trx - Fresh authorized write transaction.
 * @param chartId - Agency chart definition ID.
 * @param agencyId - Stream owner's Agency ID.
 * @param streamId - Stream ID.
 * @returns Eligible chart row, if one exists.
 */
export const findEligibleAgencyChart = async (
  trx: Transaction<Database>,
  chartId: string,
  agencyId: string,
  streamId: string
) => {
  return await trx.selectFrom('Agency_Chart_of_Account')
    .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Agency_Chart_of_Account.egcs_ay_fiscalyear')
    .innerJoin('Transfer_Payment_Fiscal_Year_Budget', 'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear', 'Agency_Fiscal_Year.id')
    .innerJoin('Transfer_Payment_Stream_Budget', 'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget', 'Transfer_Payment_Fiscal_Year_Budget.id')
    .where('Agency_Chart_of_Account.id', '=', chartId)
    .where('Agency_Chart_of_Account.egcs_ay_organizationagency', '=', agencyId)
    .where('Agency_Fiscal_Year.egcs_ay_organizationagency', '=', agencyId)
    .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream', '=', streamId)
    .where('Agency_Chart_of_Account._deleted', '=', false)
    .where('Agency_Fiscal_Year._deleted', '=', false)
    .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
    .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
    .select('Agency_Chart_of_Account.id')
    .forUpdate('Agency_Chart_of_Account')
    .executeTakeFirst()
}

/**
 * Finds a live Commitment Type definition owned by the Stream's Agency.
 *
 * @param trx - Fresh authorized write transaction.
 * @param typeId - Agency Commitment Type definition ID.
 * @param agencyId - Stream owner's Agency ID.
 * @returns Owned definition row, if one exists.
 */
export const findAgencyCommitmentType = async (
  trx: Transaction<Database>,
  typeId: string,
  agencyId: string
) => {
  return await trx.selectFrom('Agency_Commitment_Type')
    .where('id', '=', typeId)
    .where('egcs_ay_organizationagency', '=', agencyId)
    .where('_deleted', '=', false)
    .select('id')
    .forUpdate()
    .executeTakeFirst()
}
