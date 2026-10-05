/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Standalone pool credits never match an individual AR. */
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AccountReceivableOffsetMemo, AccountReceivablePaymentCreditMemo } from '~~/shared/types/account-receivable'
import { hashPublicationDefinition } from './system-publication'
import { sumMoney, parseMoney } from '~~/shared/utils/money'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { hasAccountReceivablePoolLedger, readAccountReceivablePoolBalance } from './account-receivable-pool-ledger'
import { hasAccountingTable } from './correction-schema'
import { readAccountReceivableLineBalances } from './account-receivable'

const ZERO = parseMoney('0.00')
const isoDate = (value: Date | string): string => new Date(value).toISOString()

/** Agency/global AR authority is required before projecting a complete pool. */
export const readAccountReceivableOffsetMemos = async (db: Kysely<Database>, poolIds: string[]): Promise<AccountReceivableOffsetMemo[]> => {
  if (!poolIds.length || !await hasAccountReceivablePoolLedger(db)) return []
  const memos = await db.selectFrom('Funding_Case_Account_Receivable_Offset_Memo').selectAll()
    .select(databaseMoneyText(sql.ref('egcs_fc_amount')).as('amount')).where('egcs_fc_pool', 'in', poolIds)
    .where('egcs_fc_legacyreceivable', 'is', null).where('_deleted', '=', false).orderBy('id').execute()
  const result: AccountReceivableOffsetMemo[] = []
  for (const memo of memos) {
    const balance = await readAccountReceivablePoolBalance(db, String(memo.egcs_fc_pool))
    const rows = await db.selectFrom('Funding_Case_Account_Receivable_Offset_Memo_Application as application')
      .innerJoin('Funding_Case_Account_Receivable_Recovery as recovery', 'recovery.id', 'application.egcs_fc_recovery')
      .select(['application.id', 'recovery.id as recoveryId', 'recovery.egcs_fc_payment', 'recovery.egcs_fc_outcome', 'recovery.egcs_fc_createdat', 'recovery.egcs_fc_postedat'])
      .select(databaseMoneyText(sql.ref('application.egcs_fc_amount')).as('amount')).where('application.egcs_fc_offsetmemo', '=', String(memo.id)).orderBy('application.id').execute()
    const applications = rows.map(row => ({ id: String(row.id), egcs_fc_recovery: String(row.recoveryId), egcs_fc_payment: String(row.egcs_fc_payment),
      egcs_fc_amount: parseDatabaseMoney(row.amount), egcs_fc_outcome: row.egcs_fc_outcome, egcs_fc_createdat: isoDate(row.egcs_fc_createdat),
      egcs_fc_postedat: row.egcs_fc_postedat === null ? null : isoDate(row.egcs_fc_postedat) }))
    const posted = sumMoney(applications.filter(row => row.egcs_fc_outcome === 'posted').map(row => row.egcs_fc_amount))
    result.push({ id: String(memo.id), egcs_fc_pool: String(memo.egcs_fc_pool), egcs_fc_creditmemoreference: `OCM-${memo.id}`,
      egcs_fc_amount: parseDatabaseMoney(memo.amount), egcs_fc_effectiveamount: sumMoney([posted, balance.egcs_fc_receivableamount]),
      egcs_fc_appliedamount: posted, egcs_fc_reservedamount: balance.egcs_fc_reservedamount, egcs_fc_remainingamount: balance.egcs_fc_receivableamount,
      egcs_fc_availableamount: balance.egcs_fc_availableamount, egcs_fc_createdat: isoDate(memo.egcs_fc_createdat), egcs_fc_applications: applications })
  }
  return result
}

export const linkAccountReceivablePoolOffsetApplication = async (trx: Transaction<Database>, recoveryId: string) => {
  const recovery = await trx.selectFrom('Funding_Case_Account_Receivable_Recovery').selectAll()
    .select(databaseMoneyText(sql.ref('egcs_fc_amount')).as('amount')).where('id', '=', recoveryId).executeTakeFirstOrThrow()
  const existing = await trx.selectFrom('Funding_Case_Account_Receivable_Offset_Memo').select('id')
    .where('egcs_fc_pool', '=', String(recovery.egcs_fc_pool)).where('egcs_fc_legacyreceivable', 'is', null).executeTakeFirst()
  const memoId = existing?.id ?? (await trx.insertInto('Funding_Case_Account_Receivable_Offset_Memo').values({
    egcs_fc_pool: String(recovery.egcs_fc_pool), egcs_fc_legacyreceivable: null,
    egcs_fc_amount: sql`greatest(ar_pool_net(${recovery.egcs_fc_pool}::bigint),0)` }).returning('id').executeTakeFirstOrThrow()).id
  await trx.insertInto('Funding_Case_Account_Receivable_Offset_Memo_Application').values({ egcs_fc_offsetmemo: String(memoId),
    egcs_fc_allocation: null, egcs_fc_recovery: recoveryId, egcs_fc_amount: databaseMoneyValue(parseDatabaseMoney(recovery.amount)) }).execute()
}

/** Historical migration callers retain the stopped 0300 allocation contract. */
export const linkAccountReceivableOffsetMemoApplications = async (trx: Transaction<Database>, recoveryId: string): Promise<void> => {
  if (!await hasAccountingTable(trx, 'Funding_Case_Account_Receivable_Offset_Memo') || await hasAccountReceivablePoolLedger(trx)) return
  await sql`INSERT INTO "Funding_Case_Account_Receivable_Offset_Memo" (egcs_fc_receivable,egcs_fc_pool,egcs_fc_amount)
    SELECT DISTINCT allocation.egcs_fc_receivable,recovery.egcs_fc_pool,ar_outstanding(allocation.egcs_fc_receivable)
    FROM "Funding_Case_Account_Receivable_Allocation" allocation JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id=allocation.egcs_fc_recovery
    WHERE recovery.id=${recoveryId}::bigint ON CONFLICT(egcs_fc_receivable) DO NOTHING`.execute(trx)
  await sql`INSERT INTO "Funding_Case_Account_Receivable_Offset_Memo_Application" (egcs_fc_offsetmemo,egcs_fc_allocation)
    SELECT memo.id,allocation.id FROM "Funding_Case_Account_Receivable_Allocation" allocation
    JOIN "Funding_Case_Account_Receivable_Offset_Memo" memo ON memo.egcs_fc_receivable=allocation.egcs_fc_receivable
    WHERE allocation.egcs_fc_recovery=${recoveryId}::bigint ON CONFLICT(egcs_fc_allocation) DO NOTHING`.execute(trx)
}

/** Authorized Payment projection excludes source identities and unrelated Agreement navigation. */
export const readAccountReceivablePaymentCreditMemos = async (db: Kysely<Database>, recoveryId: string | undefined): Promise<AccountReceivablePaymentCreditMemo[]> => {
  if (!recoveryId || !await hasAccountReceivablePoolLedger(db)) return []
  const recovery = await db.selectFrom('Funding_Case_Account_Receivable_Recovery').select('egcs_fc_pool').where('id', '=', recoveryId).executeTakeFirstOrThrow()
  const memos = await readAccountReceivableOffsetMemos(db, [String(recovery.egcs_fc_pool)])
  return memos.flatMap(memo => {
    const applications = memo.egcs_fc_applications.filter(row => row.egcs_fc_recovery === recoveryId)
    const outcome = applications[0]?.egcs_fc_outcome
    if (!outcome) return []
    return [{ id: memo.id, egcs_fc_offsetmemo: memo.id, egcs_fc_creditmemoreference: memo.egcs_fc_creditmemoreference,
      egcs_fc_amount: memo.egcs_fc_amount, egcs_fc_effectiveamount: memo.egcs_fc_effectiveamount,
      egcs_fc_appliedamount: outcome === 'released' ? ZERO : sumMoney(applications.map(row => row.egcs_fc_amount)),
      egcs_fc_remainingamount: memo.egcs_fc_remainingamount, egcs_fc_availableamount: memo.egcs_fc_availableamount, egcs_fc_outcome: outcome }]
  })
}

/** Reconstruct only pinned v2 evidence; current APIs never expose these old AR-owned plans. */
export const readRetainedAccountReceivablePaymentCreditMemos = async (
  db: Kysely<Database>, recoveryId: string | undefined
): Promise<AccountReceivablePaymentCreditMemo[]> => {
  if (!recoveryId || !await hasAccountingTable(db, 'Funding_Case_Account_Receivable_Offset_Memo')) return []
  const ownerColumn = await hasAccountReceivablePoolLedger(db) ? 'egcs_fc_legacyreceivable' : 'egcs_fc_receivable'
  const memos = (await sql<{ id: string; receivable: string; amount: string }>`SELECT DISTINCT memo.id::text,
    ${sql.ref(`memo.${ownerColumn}`)}::text AS receivable, memo.egcs_fc_amount::text AS amount
    FROM "Funding_Case_Account_Receivable_Offset_Memo" memo
    JOIN "Funding_Case_Account_Receivable_Offset_Memo_Application" application ON application.egcs_fc_offsetmemo=memo.id
    JOIN "Funding_Case_Account_Receivable_Allocation" allocation ON allocation.id=application.egcs_fc_allocation
    WHERE allocation.egcs_fc_recovery=${recoveryId}::bigint ORDER BY memo.id::text`.execute(db)).rows
  const result: AccountReceivablePaymentCreditMemo[] = []
  for (const memo of memos) {
    const balances = await readAccountReceivableLineBalances(db, memo.receivable)
    const remaining = sumMoney(balances.map(line => line.egcs_fc_outstanding))
    const available = sumMoney(balances.map(line => line.egcs_fc_available))
    const applications = await db.selectFrom('Funding_Case_Account_Receivable_Offset_Memo_Application as application')
      .innerJoin('Funding_Case_Account_Receivable_Allocation as allocation', 'allocation.id', 'application.egcs_fc_allocation')
      .innerJoin('Funding_Case_Account_Receivable_Recovery as recovery', 'recovery.id', 'allocation.egcs_fc_recovery')
      .select(['recovery.id', 'recovery.egcs_fc_outcome'])
      .select(databaseMoneyText(sql.ref('allocation.egcs_fc_amount')).as('amount'))
      .where('application.egcs_fc_offsetmemo', '=', memo.id).orderBy('application.id').execute()
    const outcome = applications.find(application => String(application.id) === recoveryId)!.egcs_fc_outcome
    const applied = sumMoney(applications.filter(application => application.egcs_fc_outcome === 'posted').map(application => parseDatabaseMoney(application.amount)))
    result.push({ id: memo.id, egcs_fc_offsetmemo: memo.id, egcs_fc_creditmemoreference: `OCM-${memo.id}`,
      egcs_fc_amount: parseDatabaseMoney(memo.amount), egcs_fc_effectiveamount: sumMoney([applied, remaining]),
      egcs_fc_appliedamount: outcome === 'released' ? ZERO : sumMoney(applications.filter(application => String(application.id) === recoveryId).map(application => parseDatabaseMoney(application.amount))),
      egcs_fc_remainingamount: remaining, egcs_fc_availableamount: available, egcs_fc_outcome: outcome })
  }
  return result
}

/** Payment readers may receive their retained approval basis, never unauthorized live pool totals. */
export const readPinnedAccountReceivablePaymentCreditMemos = async (db: Kysely<Database>, paymentId: string): Promise<AccountReceivablePaymentCreditMemo[]> => {
  const run = await db.selectFrom('Common_Workflow_Run as run').innerJoin('Common_Runtime as runtime', 'runtime.id', 'run.id')
    .select('run.egcs_cn_routing').where('runtime.egcs_cn_entitytype', '=', 'fundingcasepayment').where('runtime.egcs_cn_entityid', '=', paymentId)
    .where('runtime.egcs_cn_purpose', '=', 'approval_submission').where('runtime._deleted', '=', false)
    .orderBy('runtime.egcs_cn_attempt', 'desc').orderBy('runtime.id', 'desc').executeTakeFirst()
  const routing = run?.egcs_cn_routing as { paymentOffsetPacket?: import('~~/shared/types/database').JsonValue; paymentOffsetPacketHash?: string } | null
  if (!routing?.paymentOffsetPacket || !routing.paymentOffsetPacketHash || hashPublicationDefinition(routing.paymentOffsetPacket) !== routing.paymentOffsetPacketHash) return []
  const packet = routing.paymentOffsetPacket as { egcs_fc_creditmemos?: AccountReceivablePaymentCreditMemo[] }
  return packet.egcs_fc_creditmemos ?? []
}
