/* eslint-disable jsdoc/require-jsdoc -- Credit Memo lines reduce their explicitly tagged receivable. */
import { sql, type Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { subtractMoney } from '~~/shared/utils/money'
import { parseDatabaseMoney } from './database-money'

export const readAccountReceivableCashBalance = async (db: Kysely<Database>, receivableId: string, excludedMemoId?: string) => {
  const row = (await sql<{ principal: string; recovered: string; reserved: string }>`SELECT
    coalesce((SELECT sum(line.egcs_fc_amount) FROM "Funding_Case_Agreement_Account_Receivable_Line" line
      JOIN "Funding_Case_Agreement_Account_Receivable" debt ON debt.id=line.egcs_fc_receivable
      WHERE (debt.id=${receivableId}::bigint OR debt.egcs_fc_linkedreceivable=${receivableId}::bigint)
        AND debt.egcs_fc_outcome='posted' AND NOT debt._deleted AND NOT line._deleted),0)::text AS principal,
    (coalesce((SELECT sum(line.egcs_fc_amount) FROM "Funding_Case_Account_Receivable_Credit_Memo" memo
      JOIN "Funding_Case_Account_Receivable_Credit_Memo_Line" line ON line.egcs_fc_creditmemo=memo.id AND NOT line._deleted
      WHERE line.egcs_fc_receivable=${receivableId}::bigint AND memo.egcs_fc_outcome='posted' AND NOT memo._deleted
        ${excludedMemoId ? sql`AND memo.id<>${excludedMemoId}::bigint` : sql``}),0) + coalesce((SELECT sum(application.egcs_fc_amount)
      FROM "Funding_Case_Account_Receivable_Offset_Memo" memo
      JOIN "Funding_Case_Account_Receivable_Offset_Memo_Application" application ON application.egcs_fc_offsetmemo=memo.id
      JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id=application.egcs_fc_recovery
      WHERE memo.egcs_fc_receivable=${receivableId}::bigint AND recovery.egcs_fc_outcome='posted' AND NOT recovery._deleted),0))::text AS recovered,
    (coalesce((SELECT sum(line.egcs_fc_amount) FROM "Funding_Case_Account_Receivable_Credit_Memo" memo
      JOIN "Funding_Case_Account_Receivable_Credit_Memo_Line" line ON line.egcs_fc_creditmemo=memo.id AND NOT line._deleted
      WHERE line.egcs_fc_receivable=${receivableId}::bigint AND memo.egcs_fc_outcome='open' AND NOT memo._deleted
        ${excludedMemoId ? sql`AND memo.id<>${excludedMemoId}::bigint` : sql``}),0) + coalesce((SELECT sum(application.egcs_fc_amount)
      FROM "Funding_Case_Account_Receivable_Offset_Memo" memo
      JOIN "Funding_Case_Account_Receivable_Offset_Memo_Application" application ON application.egcs_fc_offsetmemo=memo.id
      JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id=application.egcs_fc_recovery
      WHERE memo.egcs_fc_receivable=${receivableId}::bigint AND recovery.egcs_fc_outcome='open' AND NOT recovery._deleted),0))::text AS reserved`.execute(db)).rows[0]!
  const principal = parseDatabaseMoney(row.principal)
  const recovered = parseDatabaseMoney(row.recovered)
  const reserved = parseDatabaseMoney(row.reserved)
  const outstanding = subtractMoney(principal, recovered)
  return { egcs_fc_principal: principal, egcs_fc_recovered: recovered, egcs_fc_reserved: reserved,
    egcs_fc_outstanding: outstanding, egcs_fc_available: subtractMoney(outstanding, reserved) }
}
