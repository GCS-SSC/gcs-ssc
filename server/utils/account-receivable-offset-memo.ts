/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Offset Credit Memos each reduce one established AR within the Payment Agency. */
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AccountReceivableOffsetMemo, AccountReceivablePaymentCreditMemo } from '~~/shared/types/account-receivable'
import { hashPublicationDefinition } from './system-publication'
import { sumMoney, parseMoney } from '~~/shared/utils/money'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { hasAccountReceivablePoolLedger } from './account-receivable-pool-ledger'
import { hasAccountingTable } from './correction-schema'
import { readAccountReceivableLineBalances } from './account-receivable'
import { readAccountReceivableCashBalance } from './account-receivable-cash-balance'
import { resolveAgreementScopeContext } from './agreement'
import { readAccountReceivableAccount } from './account-receivable-configuration'

const ZERO = parseMoney('0.00')
const isoDate = (value: Date | string): string => new Date(value).toISOString()

/** Agency/global AR authority is required before projecting a complete pool. */
export const readAccountReceivableOffsetMemos = async (db: Kysely<Database>, poolIds: string[]): Promise<AccountReceivableOffsetMemo[]> => {
  if (!poolIds.length || !await hasAccountReceivablePoolLedger(db)) return []
  const memos = await db.selectFrom('Funding_Case_Account_Receivable_Offset_Memo').selectAll()
    .select(databaseMoneyText(sql.ref('egcs_fc_amount')).as('amount')).where('egcs_fc_pool', 'in', poolIds)
    .where('_deleted', '=', false).orderBy('id').execute()
  const result: AccountReceivableOffsetMemo[] = []
  for (const memo of memos) {
    const balance = await readAccountReceivableCashBalance(db, String(memo.egcs_fc_receivable))
    const rows = await db.selectFrom('Funding_Case_Account_Receivable_Offset_Memo_Application as application')
      .innerJoin('Funding_Case_Account_Receivable_Recovery as recovery', 'recovery.id', 'application.egcs_fc_recovery')
      .select(['application.id', 'recovery.id as recoveryId', 'recovery.egcs_fc_payment', 'recovery.egcs_fc_outcome', 'recovery.egcs_fc_createdat', 'recovery.egcs_fc_postedat'])
      .select(databaseMoneyText(sql.ref('application.egcs_fc_amount')).as('amount')).where('application.egcs_fc_offsetmemo', '=', String(memo.id)).orderBy('application.id').execute()
    const applications = rows.map(row => ({ id: String(row.id), egcs_fc_recovery: String(row.recoveryId), egcs_fc_payment: String(row.egcs_fc_payment),
      egcs_fc_amount: parseDatabaseMoney(row.amount), egcs_fc_outcome: row.egcs_fc_outcome, egcs_fc_createdat: isoDate(row.egcs_fc_createdat),
      egcs_fc_postedat: row.egcs_fc_postedat === null ? null : isoDate(row.egcs_fc_postedat) }))
    const posted = sumMoney(applications.filter(row => row.egcs_fc_outcome === 'posted').map(row => row.egcs_fc_amount))
    result.push({ id: String(memo.id), egcs_fc_pool: String(memo.egcs_fc_pool), egcs_fc_receivable: String(memo.egcs_fc_receivable),
      egcs_fc_creditmemochartofaccount: String(memo.egcs_fc_creditmemochartofaccount), egcs_fc_creditmemoaccountingdimensions: memo.egcs_fc_creditmemoaccountingdimensions, egcs_fc_creditmemoreference: `OCM-${memo.id}`,
      egcs_fc_amount: parseDatabaseMoney(memo.amount),
      egcs_fc_appliedamount: posted, egcs_fc_reservedamount: sumMoney(applications.filter(row => row.egcs_fc_outcome === 'open').map(row => row.egcs_fc_amount)), egcs_fc_receivablereserved: balance.egcs_fc_reserved, egcs_fc_receivablerecovered: balance.egcs_fc_recovered, egcs_fc_receivableoutstanding: balance.egcs_fc_outstanding,
      egcs_fc_receivableavailable: balance.egcs_fc_available, egcs_fc_createdat: isoDate(memo.egcs_fc_createdat), egcs_fc_applications: applications })
  }
  return result
}

export const linkAccountReceivablePoolOffsetApplication = async (trx: Transaction<Database>, recoveryId: string,
  plans: Array<{ receivableId: string; amount: import('~~/shared/utils/money').Money }>) => {
  const recovery = await trx.selectFrom('Funding_Case_Account_Receivable_Recovery').selectAll()
    .where('id', '=', recoveryId).executeTakeFirstOrThrow()
  for (const plan of plans) {
    const debt = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable').selectAll()
      .where('id', '=', plan.receivableId).executeTakeFirstOrThrow()
    if (String(debt.egcs_fc_pool) !== String(recovery.egcs_fc_pool)) throw new Error('AR_PAYMENT_OWNER_UNAVAILABLE')
    const context = await resolveAgreementScopeContext(String(debt.egcs_fc_fundingagreement), trx)
    if (!context) throw new Error('AR_PAYMENT_OWNER_UNAVAILABLE')
    const selected = await trx.selectFrom('Agency_Chart_of_Account as account')
      .innerJoin('Transfer_Payment_Stream_Chart_of_Account as selection', 'selection.egcs_tp_agencychartofaccount', 'account.id')
      .select('account.id').where('selection.egcs_tp_transferpaymentstream', '=', context.streamId)
      .where('account.egcs_ay_kind', '=', 'credit_memo').where('account.egcs_ay_fiscalyear', '=', String(debt.egcs_fc_agencyfiscalyear))
      .where('account.egcs_ay_currency', '=', debt.egcs_fc_currency).where('account.egcs_ay_organizationagency', '=', context.agencyId)
      .where('selection._deleted', '=', false).where('account._deleted', '=', false).orderBy('account.id').executeTakeFirst()
    if (!selected) throw new Error('AR_ACCOUNT_UNAVAILABLE')
    const account = await readAccountReceivableAccount(trx, { id: String(selected.id), kind: 'credit_memo', agencyId: context.agencyId,
      streamId: context.streamId, agencyFiscalYearId: String(debt.egcs_fc_agencyfiscalyear), currency: debt.egcs_fc_currency })
    const memo = await trx.insertInto('Funding_Case_Account_Receivable_Offset_Memo').values({
      egcs_fc_pool: String(recovery.egcs_fc_pool), egcs_fc_receivable: plan.receivableId,
      egcs_fc_creditmemochartofaccount: String(account.id), egcs_fc_creditmemoaccountingdimensions: sql`${JSON.stringify(account.egcs_ay_accountingdimensions)}::jsonb`,
      egcs_fc_amount: databaseMoneyValue(plan.amount) }).returning('id').executeTakeFirstOrThrow()
    await trx.insertInto('Funding_Case_Account_Receivable_Offset_Memo_Application').values({ egcs_fc_offsetmemo: String(memo.id),
      egcs_fc_allocation: null, egcs_fc_recovery: recoveryId, egcs_fc_amount: databaseMoneyValue(plan.amount) }).execute()
  }
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
      egcs_fc_amount: memo.egcs_fc_amount,
      egcs_fc_appliedamount: outcome === 'released' ? ZERO : sumMoney(applications.map(row => row.egcs_fc_amount)),
      egcs_fc_receivablereserved: memo.egcs_fc_receivablereserved, egcs_fc_receivablerecovered: memo.egcs_fc_receivablerecovered, egcs_fc_receivableoutstanding: memo.egcs_fc_receivableoutstanding, egcs_fc_receivableavailable: memo.egcs_fc_receivableavailable, egcs_fc_outcome: outcome }]
  })
}

/** Reconstruct only pinned v2 evidence; current APIs never expose these old AR-owned plans. */
export const readRetainedAccountReceivablePaymentCreditMemos = async (
  db: Kysely<Database>, recoveryId: string | undefined
): Promise<AccountReceivablePaymentCreditMemo[]> => {
  if (!recoveryId || !await hasAccountingTable(db, 'Funding_Case_Account_Receivable_Offset_Memo')) return []
  const ownerColumn = 'egcs_fc_receivable'
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
    result.push({ id: memo.id, egcs_fc_offsetmemo: memo.id, egcs_fc_creditmemoreference: `OCM-${memo.id}`,
      egcs_fc_amount: parseDatabaseMoney(memo.amount),
      egcs_fc_appliedamount: outcome === 'released' ? ZERO : sumMoney(applications.filter(application => String(application.id) === recoveryId).map(application => parseDatabaseMoney(application.amount))),
      egcs_fc_receivablereserved: sumMoney(balances.map(line => line.egcs_fc_reserved)), egcs_fc_receivablerecovered: sumMoney(balances.map(line => line.egcs_fc_recovered)), egcs_fc_receivableoutstanding: remaining, egcs_fc_receivableavailable: available, egcs_fc_outcome: outcome })
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
