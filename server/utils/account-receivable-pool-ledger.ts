/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Aggregate ledger never attributes a repayment to an individual receivable. */
import { sql, type Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { moneyFromCents, moneyToCents, parseMoney, subtractMoney, type Money } from '~~/shared/utils/money'
import { parseDatabaseMoney } from './database-money'

const ZERO = parseMoney('0.00')
const positive = (amount: Money) => moneyToCents(amount) > BigInt(0) ? amount : ZERO

export const hasAccountReceivablePoolLedger = async (db: Kysely<Database>): Promise<boolean> =>
  (await sql<{ installed: boolean }>`SELECT to_regprocedure('public.ar_pool_net(bigint)') IS NOT NULL AS installed`.execute(db)).rows[0]?.installed === true

/** Caller must authorize the complete Agency-owned pool before reading its totals. */
export const readAccountReceivablePoolBalance = async (db: Kysely<Database>, poolId: string) => {
  const totals = (await sql<{ debit: string; credit: string; reserved: string }>`SELECT
    coalesce((SELECT sum(line.egcs_fc_amount) FROM "Funding_Case_Agreement_Account_Receivable" debt
      JOIN "Funding_Case_Agreement_Account_Receivable_Line" line ON line.egcs_fc_receivable=debt.id
      WHERE debt.egcs_fc_pool=${poolId}::bigint AND debt.egcs_fc_outcome='posted' AND NOT debt._deleted AND NOT line._deleted),0)::text AS debit,
    (coalesce((SELECT sum(egcs_fc_amount) FROM "Funding_Case_Account_Receivable_Credit_Memo" WHERE egcs_fc_pool=${poolId}::bigint AND egcs_fc_outcome='posted' AND NOT _deleted),0)
      +coalesce((SELECT sum(egcs_fc_amount) FROM "Funding_Case_Account_Receivable_Recovery" WHERE egcs_fc_pool=${poolId}::bigint AND egcs_fc_payment IS NOT NULL AND egcs_fc_outcome='posted' AND NOT _deleted),0))::text AS credit,
    coalesce((SELECT sum(egcs_fc_amount) FROM "Funding_Case_Account_Receivable_Recovery" WHERE egcs_fc_pool=${poolId}::bigint AND egcs_fc_payment IS NOT NULL AND egcs_fc_outcome='open' AND NOT _deleted),0)::text AS reserved`.execute(db)).rows[0]!
  const debit = parseDatabaseMoney(totals.debit)
  const credit = parseDatabaseMoney(totals.credit)
  const net = subtractMoney(debit, credit)
  const reserved = parseDatabaseMoney(totals.reserved)
  return { egcs_fc_debitamount: debit, egcs_fc_creditamount: credit, egcs_fc_netamount: net,
    egcs_fc_receivableamount: positive(net), egcs_fc_refundableamount: moneyToCents(net) < BigInt(0) ? moneyFromCents(-moneyToCents(net)) : ZERO,
    egcs_fc_reservedamount: reserved, egcs_fc_availableamount: positive(subtractMoney(positive(net), reserved)) }
}

export const readAccountReceivablePoolOffsetPolicy = async (db: Kysely<Database>, poolId: string) => {
  const debts = await db.selectFrom('Funding_Case_Agreement_Account_Receivable as debt').select('debt.id')
    .select(sql<string>`coalesce((SELECT latest.egcs_fc_recoverymethod FROM "Funding_Case_Agreement_Account_Receivable" latest
      WHERE (latest.id=debt.id OR latest.egcs_fc_linkedreceivable=debt.id) AND latest.egcs_fc_outcome='posted' AND NOT latest._deleted
      ORDER BY latest.egcs_fc_postedat DESC,latest.id DESC LIMIT 1),debt.egcs_fc_recoverymethod)`.as('method'))
    .where('debt.egcs_fc_pool', '=', poolId).where('debt.egcs_fc_linkedreceivable', 'is', null).where('debt.egcs_fc_outcome', '=', 'posted').where('debt._deleted', '=', false).execute()
  return debts.some(debt => debt.method === 'direct_repayment') ? 'direct_repayment' as const : 'offset' as const
}

/** Narrow engine basis includes aggregate values only, never an AR-to-credit matching. */
export const captureAccountReceivablePoolBasis = async (db: Kysely<Database>, poolId: string) => {
  const balance = await readAccountReceivablePoolBalance(db, poolId)
  return { egcs_fc_pool: poolId, ...balance, egcs_fc_recoverymethod: await readAccountReceivablePoolOffsetPolicy(db, poolId) }
}
