/* eslint-disable jsdoc/require-jsdoc -- Lines inherit the memo's exact assignment and protected write boundary. */
import type { H3Event } from 'h3'
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database, JsonValue } from '~~/shared/types/database'
import type { AccountReceivableCreditMemoLineCreate } from '~~/shared/types/schemas/account-receivable'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { isNumeric19Money, moneyFromCents, moneyToCents } from '~~/shared/utils/money'
import { authorizeAccountReceivableCreditMemo, assertAccountReceivableCreditMemoEditable, assertAccountReceivableCreditMemoScopeAuthority, validateCreditMemoAmount, validateCreditMemoCoding } from './account-receivable-credit-memo'
import { executeFreshAccountReceivableWrite } from './account-receivable-context'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { accountReceivableError } from './account-receivable-source'
import { readAccountReceivableCashBalance } from './account-receivable-cash-balance'
import { readAccountReceivablePoolBalance } from './account-receivable-pool-ledger'

export const readAccountReceivableCreditMemoLines = async (db: Kysely<Database>, id: string) => {
  const rows = await db.selectFrom('Funding_Case_Account_Receivable_Credit_Memo_Line as line')
    .selectAll('line')
    .select(databaseMoneyText(sql.ref('line.egcs_fc_amount')).as('egcs_fc_amount'))
    .where('line.egcs_fc_creditmemo', '=', id).where('line._deleted', '=', false).orderBy('line.egcs_fc_linenumber').orderBy('line.id').execute()
  return rows.map(row => ({ ...row, egcs_fc_amount: parseDatabaseMoney(row.egcs_fc_amount) }))
}

export const validateAccountReceivableCreditMemoLines = async (db: Kysely<Database>, id: string) => {
  const memo = await db.selectFrom('Funding_Case_Account_Receivable_Credit_Memo').selectAll()
    .select(databaseMoneyText(sql.ref('egcs_fc_amount')).as('egcs_fc_amount')).where('id', '=', id).where('_deleted', '=', false).executeTakeFirstOrThrow()
  const lines = await readAccountReceivableCreditMemoLines(db, id)
  if (!lines.length) throw new Error('AR_INVALID_BASIS')
  for (const line of lines) {
    if (moneyToCents(line.egcs_fc_amount) <= BigInt(0)) throw new Error('AR_INVALID_BASIS')
    await validateCreditMemoCoding(db, { ...memo, egcs_fc_creditmemochartofaccount: String(line.egcs_fc_creditmemochartofaccount) })
  }
  const total = moneyFromCents(lines.reduce((sum, line) => sum + moneyToCents(line.egcs_fc_amount), BigInt(0)))
  if (total !== parseDatabaseMoney(memo.egcs_fc_amount)) throw new Error('AR_INVALID_BASIS')
  const balance = await readAccountReceivableCashBalance(db, String(memo.egcs_fc_receivable), id)
  const pool = await readAccountReceivablePoolBalance(db, String(memo.egcs_fc_pool), { excludedCreditMemoId: id })
  if (moneyToCents(total) > moneyToCents(balance.egcs_fc_available)
    || moneyToCents(total) > moneyToCents(pool.egcs_fc_availableamount)) throw new Error('AR_SOURCE_CAPACITY')
  return { lines, total }
}

const synchronizeTotal = async (event: H3Event, trx: Transaction<Database>, id: string, receivableId: string) => {
  const lines = await readAccountReceivableCreditMemoLines(trx, id)
  const total = moneyFromCents(lines.reduce((sum, line) => sum + moneyToCents(line.egcs_fc_amount), BigInt(0)))
  if (!isNumeric19Money(total)) return await accountReceivableError(event, 'AR_SOURCE_CAPACITY')
  await validateCreditMemoAmount(event, trx, { egcs_fc_receivable: receivableId, egcs_fc_amount: total }, id)
  await trx.updateTable('Funding_Case_Account_Receivable_Credit_Memo').set({ egcs_fc_amount: databaseMoneyValue(total) }).where('id', '=', id).execute()
}

export const writeAccountReceivableCreditMemoLine = async (event: H3Event, id: string, input: AccountReceivableCreditMemoLineCreate, lineId?: string) => {
  const context = await authorizeAccountReceivableCreditMemo(event, id, 'update')
  if (lineId !== undefined && !isPositivePostgresBigintText(lineId)) return await accountReceivableError(event, 'AR_REPAYMENT_INVALID')
  return await executeFreshAccountReceivableWrite(event, context, async (trx, auth) => {
    await assertAccountReceivableCreditMemoScopeAuthority(event, trx, auth, id, 'update')
    const memo = await assertAccountReceivableCreditMemoEditable(event, trx, id)
    if (memo.egcs_fc_ledgerkind !== 'pool') return await accountReceivableError(event, 'AR_REPAYMENT_IMMUTABLE')
    const existing = lineId
      ? await trx.selectFrom('Funding_Case_Account_Receivable_Credit_Memo_Line').selectAll()
          .where('id', '=', lineId).where('egcs_fc_creditmemo', '=', id).where('_deleted', '=', false).executeTakeFirst()
      : null
    if (lineId && !existing) return await accountReceivableError(event, 'AR_REPAYMENT_INVALID')
    const duplicate = await trx.selectFrom('Funding_Case_Account_Receivable_Credit_Memo_Line').select('id')
      .where('egcs_fc_creditmemo', '=', id).where('egcs_fc_linenumber', '=', input.egcs_fc_linenumber).where('_deleted', '=', false).executeTakeFirst()
    if (duplicate && String(duplicate.id) !== lineId) return await accountReceivableError(event, 'AR_INVALID_BASIS')
    let account
    try {
      account = await validateCreditMemoCoding(trx, { ...memo, egcs_fc_creditmemochartofaccount: input.egcs_fc_creditmemochartofaccount })
    } catch (error) {
      return await accountReceivableError(event, error instanceof Error ? error.message : 'AR_ACCOUNT_UNAVAILABLE')
    }
    const values = { egcs_fc_linenumber: input.egcs_fc_linenumber, egcs_fc_creditmemochartofaccount: input.egcs_fc_creditmemochartofaccount,
      egcs_fc_creditmemoaccountingdimensions: sql<JsonValue>`${JSON.stringify(existing && String(existing.egcs_fc_creditmemochartofaccount) === input.egcs_fc_creditmemochartofaccount ? existing.egcs_fc_creditmemoaccountingdimensions : account.egcs_ay_accountingdimensions)}::jsonb`,
      egcs_fc_amount: databaseMoneyValue(input.egcs_fc_amount) }
    const saved = existing
      ? await trx.updateTable('Funding_Case_Account_Receivable_Credit_Memo_Line').set(values).where('id', '=', lineId!).returning('id').executeTakeFirstOrThrow()
      : await trx.insertInto('Funding_Case_Account_Receivable_Credit_Memo_Line').values({ ...values, egcs_fc_creditmemo: id }).returning('id').executeTakeFirstOrThrow()
    await synchronizeTotal(event, trx, id, context.receivableId)
    return { id: String(saved.id) }
  }, { target: { entityType: 'fundingcaseaccountreceivablecreditmemo', entityId: id } })
}

export const deleteAccountReceivableCreditMemoLine = async (event: H3Event, id: string, lineId: string) => {
  const context = await authorizeAccountReceivableCreditMemo(event, id, 'delete')
  if (!isPositivePostgresBigintText(lineId)) return await accountReceivableError(event, 'AR_REPAYMENT_INVALID')
  return await executeFreshAccountReceivableWrite(event, context, async (trx, auth) => {
    await assertAccountReceivableCreditMemoScopeAuthority(event, trx, auth, id, 'delete')
    const memo = await assertAccountReceivableCreditMemoEditable(event, trx, id)
    if (memo.egcs_fc_ledgerkind !== 'pool') return await accountReceivableError(event, 'AR_REPAYMENT_IMMUTABLE')
    const row = await trx.updateTable('Funding_Case_Account_Receivable_Credit_Memo_Line').set({ _deleted: true })
      .where('id', '=', lineId).where('egcs_fc_creditmemo', '=', id).where('_deleted', '=', false).returning('id').executeTakeFirst()
    if (!row) return await accountReceivableError(event, 'AR_REPAYMENT_INVALID')
    await synchronizeTotal(event, trx, id, context.receivableId)
    return { success: true }
  }, { action: 'delete', target: { entityType: 'fundingcaseaccountreceivablecreditmemo', entityId: id } })
}
