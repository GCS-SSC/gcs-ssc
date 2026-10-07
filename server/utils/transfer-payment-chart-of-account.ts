import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'

type DbClient = Kysely<Database> | Transaction<Database>

/**
 * Checks whether Commitment, AR or Credit Memo casework uses a Stream chart entry.
 *
 * @param db - Active database client or transaction.
 * @param chartOfAccountId - Chart entry to delete.
 * @returns Whether an active agreement line references the chart entry.
 */
export const hasActiveStreamChartCasework = async (
  db: DbClient,
  chartOfAccountId: string
): Promise<boolean> => {
  const activeCommitmentLine = await db
    .selectFrom('Funding_Case_Agreement_Commitment_Line')
    .select('id')
    .where('egcs_fc_transferpaymentstreamchartofaccount', '=', chartOfAccountId)
    .where('_deleted', '=', false)
    .limit(1)
    .executeTakeFirst()
  if (activeCommitmentLine) return true
  const selection = await db.selectFrom('Transfer_Payment_Stream_Chart_of_Account').selectAll()
    .where('id', '=', chartOfAccountId).executeTakeFirst()
  if (!selection) return false
  const activeReceivable = await db.selectFrom('Funding_Case_Agreement_Account_Receivable_Line as line')
    .innerJoin('Funding_Case_Agreement_Account_Receivable as debt', 'debt.id', 'line.egcs_fc_receivable')
    .innerJoin('Funding_Case_Agreement_Profile as agreement', 'agreement.id', 'debt.egcs_fc_fundingagreement')
    .select('line.id').where('line.egcs_fc_accountreceivablechartofaccount', '=', selection.egcs_tp_agencychartofaccount)
    .where('agreement.egcs_fc_transferpaymentstream', '=', selection.egcs_tp_transferpaymentstream)
    .where('line._deleted', '=', false).where('debt._deleted', '=', false).executeTakeFirst()
  if (activeReceivable) return true
  const activeMemo = await db.selectFrom('Funding_Case_Account_Receivable_Credit_Memo as memo')
    .innerJoin('Funding_Case_Agreement_Account_Receivable as debt', 'debt.id', 'memo.egcs_fc_receivable')
    .innerJoin('Funding_Case_Agreement_Profile as agreement', 'agreement.id', 'debt.egcs_fc_fundingagreement')
    .select('memo.id').where('memo.egcs_fc_creditmemochartofaccount', '=', selection.egcs_tp_agencychartofaccount)
    .where('agreement.egcs_fc_transferpaymentstream', '=', selection.egcs_tp_transferpaymentstream)
    .where('memo._deleted', '=', false).executeTakeFirst()
  if (activeMemo) return true
  const offsetMemo = await db.selectFrom('Funding_Case_Account_Receivable_Offset_Memo as memo')
    .innerJoin('Funding_Case_Agreement_Account_Receivable as debt', 'debt.id', 'memo.egcs_fc_receivable')
    .innerJoin('Funding_Case_Agreement_Profile as agreement', 'agreement.id', 'debt.egcs_fc_fundingagreement')
    .select('memo.id').where('memo.egcs_fc_creditmemochartofaccount', '=', selection.egcs_tp_agencychartofaccount)
    .where('agreement.egcs_fc_transferpaymentstream', '=', selection.egcs_tp_transferpaymentstream)
    .where('memo._deleted', '=', false).executeTakeFirst()
  return Boolean(offsetMemo)
}
