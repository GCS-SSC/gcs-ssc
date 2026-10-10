/* eslint-disable jsdoc/require-jsdoc -- AR-owned reconciliation plans retain original Claim evidence. */
import type { H3Event } from 'h3'
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AccountReceivableClaimReductionInput } from '~~/shared/types/schemas/account-receivable'
import { moneyFromCents, moneyToCents, sumMoney } from '~~/shared/utils/money'
import { authorizeAccountReceivable, assertAccountReceivableEditable } from './account-receivable'
import { executeFreshAccountReceivableWrite } from './account-receivable-context'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { accountReceivableError } from './account-receivable-source'
import { readAccountReceivableCashBalance } from './account-receivable-cash-balance'

const retainedClaimReductionBasis = (id: string, claimLine: string) => sql<string | null>`(
  SELECT sum(source_basis.amount) FROM (
    SELECT retained.egcs_fc_sourcekey,max(retained.egcs_fc_sourceamount) AS amount
    FROM "Funding_Case_Agreement_Account_Receivable_Line" retained
    WHERE retained.egcs_fc_receivable=${id}::bigint AND retained.egcs_fc_claimline=${sql.ref(claimLine)} AND NOT retained._deleted
    GROUP BY retained.egcs_fc_sourcekey) source_basis)::text`

const reservedClaimReductions = (id: string, claimLine: string) => sql<string>`coalesce((
  SELECT sum(reduction.egcs_fc_amount) FROM "Funding_Case_Account_Receivable_Claim_Reduction" reduction
  JOIN "Funding_Case_Agreement_Account_Receivable" owner ON owner.id=reduction.egcs_fc_receivable
  WHERE reduction.egcs_fc_claimline=${sql.ref(claimLine)} AND reduction.egcs_fc_receivable<>${id}::bigint
    AND NOT reduction._deleted AND (reduction.egcs_fc_appliedat IS NOT NULL OR (NOT owner._deleted AND owner.egcs_fc_outcome IN ('open','posted')))),0)::text`

export const validateAccountReceivableClaimReductionBasis = async (db: Kysely<Database>, id: string) => {
  const plans = await db.selectFrom('Funding_Case_Account_Receivable_Claim_Reduction as reduction')
    .innerJoin('Funding_Case_Agreement_Claim_Line_Item as line', 'line.id', 'reduction.egcs_fc_claimline')
    .innerJoin('Funding_Case_Agreement_Claim as claim', 'claim.id', 'reduction.egcs_fc_claim')
    .select(['reduction.egcs_fc_claim', 'line.egcs_fc_fundingagreementclaim', 'claim.egcs_fc_fundingagreement', 'claim.egcs_fc_applicantrecipient',
      'line._deleted as lineDeleted', 'claim._deleted as claimDeleted',
      databaseMoneyText(sql.ref('reduction.egcs_fc_amount')).as('amount'), databaseMoneyText(sql.ref('line.egcs_fc_amount')).as('claimed'),
      retainedClaimReductionBasis(id, 'line.id').as('basis'), reservedClaimReductions(id, 'line.id').as('reserved')])
    .where('reduction.egcs_fc_receivable', '=', id).where('reduction._deleted', '=', false).execute()
  if (!plans.length) return
  const debt = await db.selectFrom('Funding_Case_Agreement_Account_Receivable').select(['egcs_fc_fundingagreement', 'egcs_fc_applicantrecipient', 'egcs_fc_claimrelated', 'egcs_fc_linkedreceivable',
    databaseMoneyText(sql.ref('egcs_fc_amount')).as('amount')]).where('id', '=', id).executeTakeFirstOrThrow()
  if (!debt.egcs_fc_claimrelated || debt.egcs_fc_linkedreceivable) throw new Error('AR_SOURCE_UNAVAILABLE')
  if (moneyToCents(sumMoney(plans.map(plan => parseDatabaseMoney(plan.amount)))) > moneyToCents(parseDatabaseMoney(debt.amount))) throw new Error('AR_SOURCE_CAPACITY')
  for (const plan of plans) {
    if (plan.lineDeleted || plan.claimDeleted || plan.egcs_fc_claim !== plan.egcs_fc_fundingagreementclaim
      || plan.egcs_fc_fundingagreement !== debt.egcs_fc_fundingagreement || plan.egcs_fc_applicantrecipient !== debt.egcs_fc_applicantrecipient) throw new Error('AR_SOURCE_UNAVAILABLE')
    const amount = moneyToCents(parseDatabaseMoney(plan.amount))
    if (plan.basis === null || amount > moneyToCents(parseDatabaseMoney(plan.basis))) throw new Error('AR_CLAIM_REDUCTION_SOURCE_REQUIRED')
    if (amount + moneyToCents(parseDatabaseMoney(plan.reserved)) > moneyToCents(parseDatabaseMoney(plan.claimed))) throw new Error('AR_SOURCE_CAPACITY')
  }
}

export const readAccountReceivableClaimReductions = async (db: Kysely<Database>, id: string) => {
  const rows = await db.selectFrom('Funding_Case_Account_Receivable_Claim_Reduction as reduction')
    .innerJoin('Funding_Case_Agreement_Claim_Line_Item as line', 'line.id', 'reduction.egcs_fc_claimline')
    .selectAll('reduction').select(['line.egcs_fc_description', databaseMoneyText(sql.ref('reduction.egcs_fc_amount')).as('egcs_fc_amount')])
    .where('reduction.egcs_fc_receivable', '=', id).where('reduction._deleted', '=', false).orderBy('reduction.id').execute()
  return rows.map(row => ({ ...row, egcs_fc_amount: parseDatabaseMoney(row.egcs_fc_amount), egcs_fc_appliedat: row.egcs_fc_appliedat?.toISOString() ?? null }))
}

export const readAccountReceivableClaimReductionChoices = async (event: H3Event, id: string) => {
  const context = await authorizeAccountReceivable(event, id, 'read')
  const debt = await event.context.$db.selectFrom('Funding_Case_Agreement_Account_Receivable').select(['egcs_fc_claimrelated', 'egcs_fc_linkedreceivable']).where('id', '=', id).executeTakeFirstOrThrow()
  if (!debt.egcs_fc_claimrelated || debt.egcs_fc_linkedreceivable) return { items: [] }
  const rows = await event.context.$db.selectFrom('Funding_Case_Agreement_Claim_Line_Item as line')
    .innerJoin('Funding_Case_Agreement_Claim as claim', 'claim.id', 'line.egcs_fc_fundingagreementclaim')
    .where(eb => eb.exists(eb.selectFrom('Funding_Case_Agreement_Account_Receivable_Line as retained').select('retained.id').where('retained.egcs_fc_receivable', '=', id).whereRef('retained.egcs_fc_claimline', '=', 'line.id').where('retained._deleted', '=', false)))
    .select(['line.id', 'claim.id as egcs_fc_claim', 'line.egcs_fc_description', databaseMoneyText(sql.ref('line.egcs_fc_amount')).as('egcs_fc_amount'), retainedClaimReductionBasis(id, 'line.id').as('egcs_fc_sourceamount'),
      reservedClaimReductions(id, 'line.id').as('egcs_fc_reserved')])
    .where('claim.egcs_fc_fundingagreement', '=', context.agreementId).where('claim.egcs_fc_applicantrecipient', '=', context.applicantRecipientId)
    .where('claim._deleted', '=', false).where('line._deleted', '=', false).orderBy('claim.id').orderBy('line.id').execute()
  return { items: rows.map(row => {
    const amount = parseDatabaseMoney(row.egcs_fc_amount)
    const reserved = parseDatabaseMoney(row.egcs_fc_reserved)
    const basis = row.egcs_fc_sourceamount === null ? BigInt(0) : moneyToCents(parseDatabaseMoney(row.egcs_fc_sourceamount))
    const remaining = moneyToCents(amount) - moneyToCents(reserved)
    const available = remaining < BigInt(0) ? BigInt(0) : remaining < basis ? remaining : basis
    return { ...row, egcs_fc_sourceamount: row.egcs_fc_sourceamount === null ? '0.00' : parseDatabaseMoney(row.egcs_fc_sourceamount), egcs_fc_amount: amount, egcs_fc_reserved: reserved, egcs_fc_available: moneyFromCents(available) }
  }) }
}

export const saveAccountReceivableClaimReductions = async (event: H3Event, id: string, input: AccountReceivableClaimReductionInput) => {
  const context = await authorizeAccountReceivable(event, id, 'update')
  return await executeFreshAccountReceivableWrite(event, { ...context, agreementIds: [context.agreementId] }, async trx => {
    const debt = await assertAccountReceivableEditable(event, trx, id)
    if (!debt.egcs_fc_claimrelated || debt.egcs_fc_linkedreceivable) return await accountReceivableError(event, 'AR_SOURCE_UNAVAILABLE')
    const existing = await trx.selectFrom('Funding_Case_Account_Receivable_Claim_Reduction').selectAll().where('egcs_fc_receivable', '=', id).where('_deleted', '=', false).execute()
    const total = sumMoney(input.egcs_fc_lines.map(line => line.egcs_fc_amount))
    const requested = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable').select(databaseMoneyText(sql.ref('egcs_fc_amount')).as('amount')).where('id', '=', id).executeTakeFirstOrThrow()
    if (moneyToCents(total) > moneyToCents(parseDatabaseMoney(requested.amount))) return await accountReceivableError(event, 'AR_SOURCE_CAPACITY')
    for (const saved of existing) if (!input.egcs_fc_lines.some(line => line.egcs_fc_claimline === String(saved.egcs_fc_claimline))) {
      await trx.updateTable('Funding_Case_Account_Receivable_Claim_Reduction').set({ _deleted: true }).where('id', '=', String(saved.id)).execute()
    }
    for (const line of input.egcs_fc_lines) {
      const source = await trx.selectFrom('Funding_Case_Agreement_Claim_Line_Item as line')
        .innerJoin('Funding_Case_Agreement_Claim as claim', 'claim.id', 'line.egcs_fc_fundingagreementclaim')
        .select(['claim.id', databaseMoneyText(sql.ref('line.egcs_fc_amount')).as('claimed'), retainedClaimReductionBasis(id, 'line.id').as('basis'),
          reservedClaimReductions(id, 'line.id').as('reserved')]).where('line.id', '=', line.egcs_fc_claimline).where('claim.egcs_fc_fundingagreement', '=', context.agreementId)
        .where('claim.egcs_fc_applicantrecipient', '=', context.applicantRecipientId).where('line._deleted', '=', false).where('claim._deleted', '=', false)
        .forUpdate('line').executeTakeFirst()
      if (!source) return await accountReceivableError(event, 'AR_SOURCE_UNAVAILABLE')
      if (source.basis === null || moneyToCents(line.egcs_fc_amount) > moneyToCents(parseDatabaseMoney(source.basis))) return await accountReceivableError(event, 'AR_CLAIM_REDUCTION_SOURCE_REQUIRED')
      if (moneyToCents(line.egcs_fc_amount) + moneyToCents(parseDatabaseMoney(source.reserved)) > moneyToCents(parseDatabaseMoney(source.claimed))) return await accountReceivableError(event, 'AR_SOURCE_CAPACITY')
      const saved = existing.find(row => String(row.egcs_fc_claimline) === line.egcs_fc_claimline)
      const values = { egcs_fc_amount: databaseMoneyValue(line.egcs_fc_amount) }
      if (saved) await trx.updateTable('Funding_Case_Account_Receivable_Claim_Reduction').set(values).where('id', '=', String(saved.id)).execute()
      else await trx.insertInto('Funding_Case_Account_Receivable_Claim_Reduction').values({ ...values, egcs_fc_receivable: id, egcs_fc_claim: String(source.id), egcs_fc_claimline: line.egcs_fc_claimline }).execute()
    }
    return { id }
  }, { target: { entityType: context.entityType, entityId: id } })
}

/**
 * Called in the final credit posting transaction; partial receipts never alter Claim totals.
 * @param trx - Protected final Credit Memo posting transaction.
 * @param id - Original Claims receivable being fully cleared.
 */
export const applyAccountReceivableClaimReductions = async (trx: Transaction<Database>, id: string) => {
  const debt = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable').select(['egcs_fc_claimrelated', 'egcs_fc_outcome']).where('id', '=', id).forUpdate().executeTakeFirstOrThrow()
  if (!debt.egcs_fc_claimrelated || debt.egcs_fc_outcome !== 'posted') return
  const balance = await readAccountReceivableCashBalance(trx, id)
  if (moneyToCents(balance.egcs_fc_outstanding) !== BigInt(0)) return
  await validateAccountReceivableClaimReductionBasis(trx, id)
  await trx.updateTable('Funding_Case_Account_Receivable_Claim_Reduction').set({ egcs_fc_appliedat: new Date() })
    .where('egcs_fc_receivable', '=', id).where('egcs_fc_appliedat', 'is', null).where('_deleted', '=', false).execute()
}
