/* eslint-disable jsdoc/require-jsdoc -- Extension accounting choices retain the host's source and paid-capacity evidence. */
import { sql, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AgreementCodingAllocation } from './agreement-coding-allocator'
import { moneyFromCents, moneyToCents, subtractMoney } from '~~/shared/utils/money'
import { accountReceivableSourceUsage } from './account-receivable-context'
import { databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { readAccountReceivableLines, readAccountReceivableCoding, allocateRetainedAccountReceivableCoding, validateAccountReceivableBasis } from './account-receivable'

export const applyAllocatedAccountReceivableCoding = async (trx: Transaction<Database>, id: string, allocations: AgreementCodingAllocation[]) => {
  const debt = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable').select('egcs_fc_applicantrecipient').where('id', '=', id).executeTakeFirstOrThrow()
  const sources = await readAccountReceivableLines(trx, id)
  const coding = await readAccountReceivableCoding(trx, id)
  const capacities = await Promise.all(sources.map(async source => {
    const used = await trx.selectNoFrom(accountReceivableSourceUsage(String(source.egcs_fc_fundingagreement), source.egcs_fc_sourcekey, id, { applicantRecipientId: String(debt.egcs_fc_applicantrecipient) }).as('amount')).executeTakeFirstOrThrow()
    return { source, remaining: moneyToCents(subtractMoney(source.egcs_fc_sourceamount, parseDatabaseMoney(used.amount))) }
  }))
  await trx.updateTable('Funding_Case_Agreement_Account_Receivable_Coding').set({ _deleted: true }).where('egcs_fc_receivable', '=', id).execute()
  await trx.updateTable('Funding_Case_Agreement_Account_Receivable_Line').set({ _deleted: true }).where('egcs_fc_receivable', '=', id).execute()
  for (const allocation of allocations) {
    let remaining = moneyToCents(allocation.amount)
    for (const capacity of capacities) {
      if (remaining === BigInt(0)) break
      if (capacity.remaining <= BigInt(0)) continue
      const applied = remaining < capacity.remaining ? remaining : capacity.remaining
      const amount = moneyFromCents(applied)
      const { id: sourceId, ...source } = capacity.source
      const line = await trx.insertInto('Funding_Case_Agreement_Account_Receivable_Line').values({ ...source,
        egcs_fc_amount: databaseMoneyValue(amount), egcs_fc_sourceamount: databaseMoneyValue(source.egcs_fc_sourceamount),
        egcs_fc_accountreceivablechartofaccount: allocation.agencyChartOfAccountId,
        egcs_fc_accountreceivableaccountingdimensions: sql`${JSON.stringify(allocation.accountingDimensions)}::jsonb`,
        egcs_fc_evidence: sql`${JSON.stringify(source.egcs_fc_evidence)}::jsonb`, _deleted: false }).returning('id').executeTakeFirstOrThrow()
      const sourceCoding = coding.filter(row => String(row.egcs_fc_receivableline) === String(sourceId))
      const split = allocateRetainedAccountReceivableCoding(amount, sourceCoding.map(row => ({ id: String(row.id), basis: row.egcs_fc_paidbasis, capacity: row.egcs_fc_paidbasis })))
      for (const partition of split) {
        const { id: _codingId, ...retained } = sourceCoding.find(row => String(row.id) === partition.id)!
        await trx.insertInto('Funding_Case_Agreement_Account_Receivable_Coding').values({ ...retained,
          egcs_fc_receivableline: String(line.id), egcs_fc_amount: databaseMoneyValue(partition.amount),
          egcs_fc_paidbasis: databaseMoneyValue(retained.egcs_fc_paidbasis), egcs_fc_sharedpaidbasis: databaseMoneyValue(retained.egcs_fc_sharedpaidbasis),
          egcs_fc_accountingdimensions: sql`${JSON.stringify(retained.egcs_fc_accountingdimensions)}::jsonb`, _deleted: false }).execute()
      }
      remaining -= applied
      capacity.remaining -= applied
    }
    if (remaining !== BigInt(0)) throw new Error('AR_SOURCE_CAPACITY')
  }
  await validateAccountReceivableBasis(trx, id)
}
