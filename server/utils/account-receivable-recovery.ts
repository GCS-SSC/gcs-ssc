/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Narrow engine-owned Payment controls, reservations and exact principal allocation. */
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Currency_Codes, Database, JsonValue } from '~~/shared/types/database'
import { moneyFromCents, moneyToCents, parseMoney, subtractMoney, sumMoney, type Money } from '~~/shared/utils/money'
import { resolveAgreementScopeContext } from './agreement'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { allocateRetainedAccountReceivableCoding, readAccountReceivableApprovedRecoveryMethod, readAccountReceivableCoding, readAccountReceivableLineBalances } from './account-receivable'
import { lockAccountReceivablePaymentPoolAgreements } from './account-receivable-context'
import { hashPublicationDefinition } from './system-publication'
import { hasAccountingTable } from './correction-schema'
import { getAgreementAccountingCodingPools } from './agreement-accounting-projection'
import { formatAccountReceivableCreditMemoSettlementReference } from '~~/shared/utils/account-receivable'
import { linkAccountReceivablePoolOffsetApplication, readAccountReceivablePaymentCreditMemos, readRetainedAccountReceivablePaymentCreditMemos, readPinnedAccountReceivablePaymentCreditMemos } from './account-receivable-offset-memo'
import { hasAccountReceivablePoolLedger, readAccountReceivablePoolBalance, readAccountReceivablePoolOffsetPolicy, captureAccountReceivablePoolBasis } from './account-receivable-pool-ledger'

import { readAccountReceivableCashBalance } from './account-receivable-cash-balance'

const ZERO = parseMoney('0.00')
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue

export const readAccountReceivablePoolDebts = async (db: Kysely<Database>, input: { agencyId: string; applicantRecipientId: string; currency?: Currency_Codes }) => {
  let query = db.selectFrom('Funding_Case_Agreement_Account_Receivable as debt')
    .innerJoin('Funding_Case_Account_Receivable_Pool as pool', 'pool.id', 'debt.egcs_fc_pool')
    .innerJoin('Agency_Fiscal_Year as year', 'year.id', 'debt.egcs_fc_agencyfiscalyear')
    .selectAll('debt').select('year.egcs_ay_fiscalyear as fiscalYearOrder')
    .where('pool.egcs_fc_agency', '=', input.agencyId).where('pool.egcs_fc_applicantrecipient', '=', input.applicantRecipientId)
    .where('debt.egcs_fc_linkedreceivable', 'is', null).where('debt.egcs_fc_outcome', '=', 'posted').where('debt._deleted', '=', false)
  if (input.currency) query = query.where('debt.egcs_fc_currency', '=', input.currency)
  const debts = await query.orderBy('year.egcs_ay_fiscalyear').orderBy('debt.egcs_fc_postedat').orderBy('debt.id').execute()
  const result = []
  for (const debt of debts) {
    result.push({ ...debt, egcs_fc_recoverymethod: await readAccountReceivableApprovedRecoveryMethod(db, String(debt.id)),
      lines: await readAccountReceivableLineBalances(db, String(debt.id)) })
  }
  return result.sort((left, right) => {
    const yearOrder = BigInt(left.fiscalYearOrder) - BigInt(right.fiscalYearOrder)
    if (yearOrder !== BigInt(0)) return yearOrder < BigInt(0) ? -1 : 1
    const typeOrder = Number(!left.egcs_fc_advancepaymentrelated) - Number(!right.egcs_fc_advancepaymentrelated)
    if (typeOrder) return typeOrder
    const dateOrder = new Date(left.egcs_fc_postedat!).getTime() - new Date(right.egcs_fc_postedat!).getTime()
    return dateOrder || (BigInt(left.id) < BigInt(right.id) ? -1 : 1)
  })
}

export const assertAccountReceivablePaymentAllowed = async (
  db: Kysely<Database>, input: { agreementId: string; applicantRecipientId: string; currency: Currency_Codes; paymentId?: string }
) => {
  if (!await hasAccountingTable(db, 'Funding_Case_Agreement_Account_Receivable')) return
  const context = await resolveAgreementScopeContext(input.agreementId, db)
  if (!context) throw new Error('AR_PAYMENT_OWNER_UNAVAILABLE')
  if (await hasAccountReceivablePoolLedger(db)) {
    const pools = await db.selectFrom('Funding_Case_Account_Receivable_Pool').selectAll().where('egcs_fc_agency', '=', context.agencyId)
      .where('egcs_fc_applicantrecipient', '=', input.applicantRecipientId).where('_deleted', '=', false).execute()
    for (const pool of pools) {
      const balance = await readAccountReceivablePoolBalance(db, String(pool.id))
      if (moneyToCents(balance.egcs_fc_receivableamount) > BigInt(0) && await readAccountReceivablePoolOffsetPolicy(db, String(pool.id)) === 'direct_repayment') throw new Error('AR_DIRECT_REPAYMENT_HOLD')
      if (pool.egcs_fc_currency !== input.currency) continue
      let pending = db.selectFrom('Funding_Case_Account_Receivable_Recovery').select('id').where('egcs_fc_pool', '=', String(pool.id))
        .where('egcs_fc_outcome', '=', 'open').where('_deleted', '=', false)
      if (input.paymentId) pending = pending.where(eb => eb.or([eb('egcs_fc_payment', 'is', null), eb('egcs_fc_payment', '!=', input.paymentId!)]))
      if (await db.selectFrom('Funding_Case_Account_Receivable_Credit_Memo').select('id')
        .where('egcs_fc_pool', '=', String(pool.id)).where('egcs_fc_outcome', '=', 'open').where('_deleted', '=', false).executeTakeFirst()) throw new Error('AR_RECOVERY_UNRESOLVED')
      if (await pending.executeTakeFirst()) throw new Error('AR_RECOVERY_UNRESOLVED')
      if (await db.selectFrom('Funding_Case_Agreement_Account_Receivable').select('id').where('egcs_fc_pool', '=', String(pool.id))
        .where('egcs_fc_linkedreceivable', 'is not', null).where('egcs_fc_outcome', '=', 'open').where('_deleted', '=', false).executeTakeFirst()) throw new Error('AR_ADJUSTMENT_UNRESOLVED')
    }
    return
  }
  const debts = await readAccountReceivablePoolDebts(db, { agencyId: context.agencyId, applicantRecipientId: input.applicantRecipientId })
  if (debts.some(debt => debt.egcs_fc_recoverymethod === 'direct_repayment'
    && moneyToCents(sumMoney(debt.lines.map(line => line.egcs_fc_outstanding))) > BigInt(0))) throw new Error('AR_DIRECT_REPAYMENT_HOLD')
  const pools = await db.selectFrom('Funding_Case_Account_Receivable_Pool').select('id').where('egcs_fc_agency', '=', context.agencyId)
    .where('egcs_fc_applicantrecipient', '=', input.applicantRecipientId).where('egcs_fc_currency', '=', input.currency).execute()
  if (!pools.length) return
  const poolIds = pools.map(row => String(row.id))
  let recovery = db.selectFrom('Funding_Case_Account_Receivable_Recovery').select('id').where('egcs_fc_pool', 'in', poolIds)
    .where('egcs_fc_outcome', '=', 'open').where('_deleted', '=', false)
  if (input.paymentId) recovery = recovery.where(eb => eb.or([eb('egcs_fc_payment', 'is', null), eb('egcs_fc_payment', '!=', input.paymentId!)]))
  if (await recovery.executeTakeFirst()) throw new Error('AR_RECOVERY_UNRESOLVED')
  const adjustment = await db.selectFrom('Funding_Case_Agreement_Account_Receivable as debt')
    .select('debt.id').where('debt.egcs_fc_pool', 'in', poolIds).where('debt.egcs_fc_linkedreceivable', 'is not', null)
    .where('debt.egcs_fc_outcome', '=', 'open').where('debt._deleted', '=', false).executeTakeFirst()
  if (adjustment) throw new Error('AR_ADJUSTMENT_UNRESOLVED')
}

export const readAccountReceivableRecoveryAllocations = async (db: Kysely<Database>, recoveryId: string) => {
  const rows = await db.selectFrom('Funding_Case_Account_Receivable_Allocation as allocation')
    .innerJoin('Funding_Case_Agreement_Account_Receivable as debt', 'debt.id', 'allocation.egcs_fc_receivable')
    .selectAll('allocation').select(['debt.egcs_fc_number', 'debt.egcs_fc_agreementnumber', 'debt.egcs_fc_type', 'debt.egcs_fc_typename_en', 'debt.egcs_fc_typename_fr', 'debt.egcs_fc_advancepaymentrelated', 'debt.egcs_fc_claimrelated', 'debt.egcs_fc_recoverymethod',
      databaseMoneyText(sql.ref('allocation.egcs_fc_amount')).as('egcs_fc_amount')])
    .where('allocation.egcs_fc_recovery', '=', recoveryId).where('allocation._deleted', '=', false).orderBy('allocation.id').execute()
  return rows.map(row => ({ ...row, egcs_fc_amount: parseDatabaseMoney(row.egcs_fc_amount) }))
}

export const releaseAccountReceivablePaymentOffset = async (trx: Transaction<Database>, paymentId: string) => {
  if (!await hasAccountingTable(trx, 'Funding_Case_Agreement_Account_Receivable')) return
  await trx.updateTable('Funding_Case_Account_Receivable_Recovery').set({ egcs_fc_outcome: 'released', egcs_fc_releasedat: new Date() })
    .where('egcs_fc_payment', '=', paymentId).where('egcs_fc_outcome', '=', 'open').where('_deleted', '=', false).execute()
}

export const rebuildAccountReceivablePaymentOffset = async (trx: Transaction<Database>, paymentId: string) => {
  if (!await hasAccountingTable(trx, 'Funding_Case_Agreement_Account_Receivable')) return null
  const payment = await trx.selectFrom('Funding_Case_Agreement_Payment').selectAll()
    .select(databaseMoneyText(sql.ref('egcs_fc_paymentamount')).as('gross')).where('id', '=', paymentId).where('_deleted', '=', false).executeTakeFirstOrThrow()
  if (!payment.egcs_fc_applicantrecipient) throw new Error('AR_PAYMENT_PAYEE_REQUIRED')
  const context = await resolveAgreementScopeContext(String(payment.egcs_fc_fundingagreement), trx)
  if (!context) throw new Error('AR_PAYMENT_OWNER_UNAVAILABLE')
  const { pool } = await lockAccountReceivablePaymentPoolAgreements(trx, { agencyId: context.agencyId,
    applicantRecipientId: String(payment.egcs_fc_applicantrecipient), currency: payment.egcs_fc_currency, agreementId: context.agreementId })
  const completion = await trx.selectFrom('Common_Completion').select('id').where('egcs_cn_entitytype', '=', 'fundingcasepayment')
    .where('egcs_cn_entityid', '=', paymentId).where('_deleted', '=', false).executeTakeFirst()
  if (completion) throw new Error('AR_OFFSET_PINNED')
  await assertAccountReceivablePaymentAllowed(trx, { agreementId: context.agreementId, applicantRecipientId: String(payment.egcs_fc_applicantrecipient), currency: payment.egcs_fc_currency, paymentId })
  await releaseAccountReceivablePaymentOffset(trx, paymentId)
  const debts = await readAccountReceivablePoolDebts(trx, { agencyId: context.agencyId,
    applicantRecipientId: String(payment.egcs_fc_applicantrecipient), currency: payment.egcs_fc_currency })
  let remaining = moneyToCents(parseDatabaseMoney(payment.gross))
  const plans: Array<{ receivableId: string; amount: Money }> = []
  for (const debt of debts.filter(item => item.egcs_fc_recoverymethod === 'offset')) {
    const balance = await readAccountReceivableCashBalance(trx, String(debt.id))
    const available = moneyToCents(balance.egcs_fc_available)
    const amount = available < remaining ? available : remaining
    if (amount <= BigInt(0)) continue
    plans.push({ receivableId: String(debt.id), amount: moneyFromCents(amount) })
    remaining -= amount
    if (remaining <= BigInt(0)) break
  }
  if (plans.length) {
    const amount = sumMoney(plans.map(plan => plan.amount))
    const recovery = await trx.insertInto('Funding_Case_Account_Receivable_Recovery').values({ egcs_fc_pool: String(pool.id), egcs_fc_payment: paymentId,
      egcs_fc_creditmemo: null, egcs_fc_ledgerkind: 'pool', egcs_fc_amount: databaseMoneyValue(amount) }).returning('id').executeTakeFirstOrThrow()
    await linkAccountReceivablePoolOffsetApplication(trx, String(recovery.id), plans)
  }
  return await readAccountReceivablePaymentOffset(trx, paymentId)
}

/** Deliberately omits rationale, source data, sibling Agreement identity and debt navigation. */
export const readAccountReceivablePaymentOffset = async (db: Kysely<Database>, paymentId: string, options: { liveMemoBalances?: boolean } = {}) => {
  if (!await hasAccountingTable(db, 'Funding_Case_Agreement_Account_Receivable')) {
    const historical = await db.selectFrom('Funding_Case_Agreement_Payment').select(databaseMoneyText(sql.ref('egcs_fc_paymentamount')).as('gross'))
      .where('id', '=', paymentId).executeTakeFirstOrThrow()
    const gross = parseDatabaseMoney(historical.gross)
    return { egcs_fc_grossamount: gross, egcs_fc_offsetamount: ZERO, egcs_fc_netamount: gross, egcs_fc_recoverycontrol: 'allowed' as const, egcs_fc_creditmemoreference: null, egcs_fc_offsets: [], egcs_fc_creditmemos: [] }
  }
  const payment = await db.selectFrom('Funding_Case_Agreement_Payment').select(['egcs_fc_fundingagreement', 'egcs_fc_applicantrecipient', 'egcs_fc_currency'])
    .select(sql<boolean>`EXISTS (SELECT 1 FROM "Common_Status" status WHERE status.id = "Funding_Case_Agreement_Payment".egcs_fc_status AND status.egcs_cn_terminal AND NOT status._deleted)`.as('egcs_fc_isterminal'))
    .select(databaseMoneyText(sql.ref('egcs_fc_paymentamount')).as('gross')).where('id', '=', paymentId).executeTakeFirstOrThrow()
  const recoveries = await db.selectFrom('Funding_Case_Account_Receivable_Recovery').select(['id', 'egcs_fc_outcome'])
    .select(databaseMoneyText(sql.ref('egcs_fc_amount')).as('amount')).where('egcs_fc_payment', '=', paymentId)
    .where('egcs_fc_outcome', 'in', ['open', 'posted']).where('_deleted', '=', false).execute()
  const settled = payment.egcs_fc_isterminal || recoveries.some(recovery => recovery.egcs_fc_outcome === 'posted')
  const retainedRecovery = recoveries[0] ?? (payment.egcs_fc_isterminal
    ? await db.selectFrom('Funding_Case_Account_Receivable_Recovery')
        .select(['id', 'egcs_fc_outcome']).where('egcs_fc_payment', '=', paymentId).where('_deleted', '=', false).orderBy('id', 'desc').executeTakeFirst()
    : undefined)
  const allocations = []
  for (const recovery of recoveries) allocations.push(...await readAccountReceivableRecoveryAllocations(db, String(recovery.id)))
  const gross = parseDatabaseMoney(payment.gross)
  const offset = sumMoney(recoveries.map(row => parseDatabaseMoney(row.amount)))
  let control: 'allowed' | 'direct_repayment_hold' | 'recovery_pending' = 'allowed'
  if (payment.egcs_fc_applicantrecipient && !settled) {
    try {
      await assertAccountReceivablePaymentAllowed(db, { agreementId: String(payment.egcs_fc_fundingagreement),
        applicantRecipientId: String(payment.egcs_fc_applicantrecipient), currency: payment.egcs_fc_currency, paymentId })
    } catch (error) {
      if (error instanceof Error && error.message === 'AR_DIRECT_REPAYMENT_HOLD') control = 'direct_repayment_hold'
      else if (error instanceof Error && ['AR_RECOVERY_UNRESOLVED', 'AR_ADJUSTMENT_UNRESOLVED'].includes(error.message)) control = 'recovery_pending'
      else throw error
    }
  }
  return { egcs_fc_grossamount: gross, egcs_fc_offsetamount: offset, egcs_fc_netamount: subtractMoney(gross, offset),
    egcs_fc_recoverycontrol: control, egcs_fc_creditmemoreference: retainedRecovery ? formatAccountReceivableCreditMemoSettlementReference(String(retainedRecovery.id)) : null,
    egcs_fc_creditmemos: options.liveMemoBalances
      ? await readAccountReceivablePaymentCreditMemos(db, retainedRecovery ? String(retainedRecovery.id) : undefined)
      : (await readPinnedAccountReceivablePaymentCreditMemos(db, paymentId)).map(memo => ({ ...memo,
          egcs_fc_outcome: retainedRecovery?.egcs_fc_outcome ?? memo.egcs_fc_outcome,
          egcs_fc_appliedamount: retainedRecovery?.egcs_fc_outcome === 'released' ? ZERO : memo.egcs_fc_appliedamount })),
    egcs_fc_offsets: allocations.map(row => ({ egcs_fc_number: row.egcs_fc_number, egcs_fc_amount: row.egcs_fc_amount })) }
}

export const captureAccountReceivablePaymentOffsetPacket = async (db: Kysely<Database>, paymentId: string, options: { version?: 1 | 2 | 3 | 4 } = {}) => {
  const { egcs_fc_creditmemos: creditMemos, ...legacySummary } = await readAccountReceivablePaymentOffset(db, paymentId, { liveMemoBalances: true })
  const version = options.version ?? (await hasAccountReceivablePoolLedger(db) ? 4 : await hasAccountingTable(db, 'Funding_Case_Account_Receivable_Offset_Memo') ? 2 : 1)
  const legacyRecovery = version === 2
    ? await db.selectFrom('Funding_Case_Account_Receivable_Recovery').select('id').where('egcs_fc_payment', '=', paymentId)
        .where('egcs_fc_outcome', 'in', ['open', 'posted']).where('_deleted', '=', false).executeTakeFirst()
    : undefined
  const summary = version === 1
    ? legacySummary
    : { ...legacySummary, egcs_fc_creditmemos: version === 2
        ? await readRetainedAccountReceivablePaymentCreditMemos(db, legacyRecovery ? String(legacyRecovery.id) : undefined)
        : creditMemos }
  if (!await hasAccountingTable(db, 'Funding_Case_Agreement_Account_Receivable')) return { schemaVersion: 1 as const, ...summary, allocationBasisHash: null }
  const payment = await db.selectFrom('Funding_Case_Agreement_Payment as payment')
    .innerJoin('Funding_Case_Agreement_Profile as agreement', 'agreement.id', 'payment.egcs_fc_fundingagreement')
    .leftJoin('Applicant_Recipient_Profile as payee', 'payee.id', 'payment.egcs_fc_applicantrecipient')
    .select(['payment.egcs_fc_currency', 'payment.egcs_fc_fundingagreement', 'agreement.egcs_fc_agreementnumber',
      'payment.egcs_fc_applicantrecipient', 'payment.egcs_fc_paymenttype',
      'payee.egcs_ar_legalname_en as egcs_fc_payeename_en', 'payee.egcs_ar_legalname_fr as egcs_fc_payeename_fr'])
    .where('payment.id', '=', paymentId).executeTakeFirstOrThrow()
  const recovery = await db.selectFrom('Funding_Case_Account_Receivable_Recovery').select('id')
    .where('egcs_fc_payment', '=', paymentId).where('egcs_fc_outcome', '=', 'open').where('_deleted', '=', false).executeTakeFirst()
  const owner = await resolveAgreementScopeContext(String(payment.egcs_fc_fundingagreement), db)
  if ((version === 3 || version === 4) && owner && payment.egcs_fc_applicantrecipient) {
    const pool = await db.selectFrom('Funding_Case_Account_Receivable_Pool').select('id').where('egcs_fc_agency', '=', owner.agencyId)
      .where('egcs_fc_applicantrecipient', '=', String(payment.egcs_fc_applicantrecipient)).where('egcs_fc_currency', '=', payment.egcs_fc_currency).executeTakeFirst()
    return { schemaVersion: version, ...summary, payment: { ...payment, egcs_fc_paymentamount: summary.egcs_fc_grossamount },
      poolBasisHash: pool ? hashPublicationDefinition(json(await captureAccountReceivablePoolBasis(db, String(pool.id)))) : null,
      allocationBasisHash: null, debtBasisHash: null }
  }
  const debts = owner && payment.egcs_fc_applicantrecipient
    ? await readAccountReceivablePoolDebts(db, { agencyId: owner.agencyId,
        applicantRecipientId: String(payment.egcs_fc_applicantrecipient), currency: payment.egcs_fc_currency })
    : []
  return { schemaVersion: version, ...summary, payment: { ...payment, egcs_fc_paymentamount: summary.egcs_fc_grossamount },
    debtBasisHash: hashPublicationDefinition(json(debts.map(debt => ({ id: String(debt.id), method: debt.egcs_fc_recoverymethod,
      lines: debt.lines.map(line => ({ id: String(line.id), principal: line.egcs_fc_principal, recovered: line.egcs_fc_recovered, reserved: line.egcs_fc_reserved })) })))),
    allocationBasisHash: recovery ? hashPublicationDefinition(json(await readAccountReceivableRecoveryAllocations(db, String(recovery.id)))) : null }
}

export const validateAccountReceivablePaymentOffset = async (trx: Transaction<Database>, paymentId: string, options: { packet?: JsonValue } = {}) => {
  if (!await hasAccountingTable(trx, 'Funding_Case_Agreement_Account_Receivable')) return await captureAccountReceivablePaymentOffsetPacket(trx, paymentId)
  const payment = await trx.selectFrom('Funding_Case_Agreement_Payment').select(['egcs_fc_fundingagreement', 'egcs_fc_applicantrecipient', 'egcs_fc_currency']).where('id', '=', paymentId).executeTakeFirstOrThrow()
  if (!payment.egcs_fc_applicantrecipient) throw new Error('AR_PAYMENT_PAYEE_REQUIRED')
  await assertAccountReceivablePaymentAllowed(trx, { agreementId: String(payment.egcs_fc_fundingagreement), applicantRecipientId: String(payment.egcs_fc_applicantrecipient), currency: payment.egcs_fc_currency, paymentId })
  const retainedVersion = options.packet && typeof options.packet === 'object' && !Array.isArray(options.packet)
    && (options.packet.schemaVersion === 1 || options.packet.schemaVersion === 2)
    ? options.packet.schemaVersion
    : undefined
  const packet = await captureAccountReceivablePaymentOffsetPacket(trx, paymentId, { version: retainedVersion })
  if (options.packet && hashPublicationDefinition(json(packet)) !== hashPublicationDefinition(options.packet)) throw new Error('AR_OFFSET_BASIS_CHANGED')
  if (moneyToCents(packet.egcs_fc_netamount) < BigInt(0)) throw new Error('AR_OFFSET_EXCEEDS_GROSS')
  const recovery = await trx.selectFrom('Funding_Case_Account_Receivable_Recovery').select('id').where('egcs_fc_payment', '=', paymentId)
    .where('egcs_fc_outcome', '=', 'open').where('_deleted', '=', false).executeTakeFirst()
  if (packet.schemaVersion === 3 || packet.schemaVersion === 4) {
    const owner = await resolveAgreementScopeContext(String(payment.egcs_fc_fundingagreement), trx)
    if (!owner) throw new Error('AR_PAYMENT_OWNER_UNAVAILABLE')
    const pool = await trx.selectFrom('Funding_Case_Account_Receivable_Pool').select('id').where('egcs_fc_agency', '=', owner.agencyId)
      .where('egcs_fc_applicantrecipient', '=', String(payment.egcs_fc_applicantrecipient)).where('egcs_fc_currency', '=', payment.egcs_fc_currency).executeTakeFirstOrThrow()
    const balance = await readAccountReceivablePoolBalance(trx, String(pool.id))
    const eligible = moneyToCents(balance.egcs_fc_availableamount) + moneyToCents(packet.egcs_fc_offsetamount)
    const gross = moneyToCents(packet.egcs_fc_grossamount)
    if (moneyToCents(packet.egcs_fc_offsetamount) !== (eligible < gross ? eligible : gross)) throw new Error('AR_OFFSET_PLAN_STALE')
    return packet
  }
  const owner = await resolveAgreementScopeContext(String(payment.egcs_fc_fundingagreement), trx)
  if (!owner) throw new Error('AR_PAYMENT_OWNER_UNAVAILABLE')
  const debts = await readAccountReceivablePoolDebts(trx, { agencyId: owner.agencyId, applicantRecipientId: String(payment.egcs_fc_applicantrecipient), currency: payment.egcs_fc_currency })
  const eligible = moneyToCents(sumMoney(debts.filter(debt => debt.egcs_fc_recoverymethod === 'offset').flatMap(debt => debt.lines.map(line => line.egcs_fc_available))))
    + moneyToCents(packet.egcs_fc_offsetamount)
  const gross = moneyToCents(packet.egcs_fc_grossamount)
  if (moneyToCents(packet.egcs_fc_offsetamount) !== (eligible < gross ? eligible : gross)) throw new Error('AR_OFFSET_PLAN_STALE')
  if (recovery) {
    if (await hasAccountReceivablePoolLedger(trx)) {
      const pool = await trx.selectFrom('Funding_Case_Account_Receivable_Pool').select('id').where('egcs_fc_agency', '=', owner.agencyId)
        .where('egcs_fc_applicantrecipient', '=', String(payment.egcs_fc_applicantrecipient)).where('egcs_fc_currency', '=', payment.egcs_fc_currency).executeTakeFirstOrThrow()
      if (moneyToCents((await readAccountReceivablePoolBalance(trx, String(pool.id))).egcs_fc_receivableamount) < moneyToCents(packet.egcs_fc_offsetamount)) throw new Error('AR_OFFSET_PLAN_STALE')
    }
    await validateAccountReceivableRecovery(trx, String(recovery.id))
  }
  return packet
}

export const validateAccountReceivableRecovery = async (trx: Transaction<Database>, recoveryId: string) => {
  const recovery = await trx.selectFrom('Funding_Case_Account_Receivable_Recovery').selectAll()
    .select(databaseMoneyText(sql.ref('egcs_fc_amount')).as('amount')).where('id', '=', recoveryId).forUpdate().executeTakeFirstOrThrow()
  if (recovery.egcs_fc_outcome !== 'open') throw new Error('AR_RECOVERY_TERMINAL')
  const pool = await trx.selectFrom('Funding_Case_Account_Receivable_Pool').selectAll().where('id', '=', recovery.egcs_fc_pool).executeTakeFirstOrThrow()
  const allocations = await readAccountReceivableRecoveryAllocations(trx, recoveryId)
  if (!allocations.length || sumMoney(allocations.map(row => row.egcs_fc_amount)) !== parseDatabaseMoney(recovery.amount)) throw new Error('AR_ALLOCATION_TOTAL')
  for (const allocation of allocations) {
    const debt = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable').selectAll().where('id', '=', allocation.egcs_fc_receivable).where('_deleted', '=', false).executeTakeFirstOrThrow()
    const owner = await resolveAgreementScopeContext(String(debt.egcs_fc_fundingagreement), trx)
    if (debt.egcs_fc_outcome !== 'posted' || debt.egcs_fc_linkedreceivable || String(debt.egcs_fc_pool) !== String(pool.id)
      || !owner || owner.agencyId !== String(pool.egcs_fc_agency) || String(debt.egcs_fc_applicantrecipient) !== String(pool.egcs_fc_applicantrecipient)
      || debt.egcs_fc_currency !== pool.egcs_fc_currency) throw new Error('AR_ALLOCATION_OWNER')
    const line = (await readAccountReceivableLineBalances(trx, String(debt.id))).find(row => String(row.id) === String(allocation.egcs_fc_receivableline))
    if (!line || moneyToCents(line.egcs_fc_available) < BigInt(0)) throw new Error('AR_ALLOCATION_CAPACITY')
  }
  return { recovery, allocations }
}

export const postAccountReceivableRecovery = async (trx: Transaction<Database>, recoveryId: string, runtimeId: string) => {
  const existing = await trx.selectFrom('Funding_Case_Account_Receivable_Recovery').selectAll().where('id', '=', recoveryId).forUpdate().executeTakeFirstOrThrow()
  if (existing.egcs_fc_outcome === 'posted' && String(existing.egcs_fc_postingruntime) === runtimeId) return
  const { allocations } = await validateAccountReceivableRecovery(trx, recoveryId)
  const paidCapacity = new Map<string, Money>()
  for (const agreementId of new Set(allocations.map(row => String(row.egcs_fc_fundingagreement)))) {
    for (const [chartId, pool] of await getAgreementAccountingCodingPools(trx, agreementId)) paidCapacity.set(`${agreementId}:${chartId}`, pool.paid)
  }
  for (const allocation of allocations) {
    const sourceLine = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable_Line').select(['egcs_fc_accountreceivablechartofaccount', 'egcs_fc_accountreceivableaccountingdimensions'])
      .where('id', '=', String(allocation.egcs_fc_receivableline)).executeTakeFirstOrThrow()
    if (!sourceLine.egcs_fc_accountreceivablechartofaccount) throw new Error('AR_ACCOUNT_REQUIRED')
    const coding = (await readAccountReceivableCoding(trx, String(allocation.egcs_fc_receivable))).filter(row => String(row.egcs_fc_receivableline) === String(allocation.egcs_fc_receivableline))
    const postings = await trx.selectFrom('Funding_Case_Account_Receivable_Posting as posting')
      .innerJoin('Funding_Case_Account_Receivable_Recovery as recovery', 'recovery.id', 'posting.egcs_fc_recovery')
      .select(['posting.egcs_fc_coding', databaseMoneyText(sql.ref('posting.egcs_fc_amount')).as('amount')])
      .where('posting.egcs_fc_coding', 'in', coding.map(row => String(row.id))).where('recovery.egcs_fc_outcome', '=', 'posted').where('posting._deleted', '=', false).execute()
    const adjustments = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable_Coding as coding')
      .innerJoin('Funding_Case_Agreement_Account_Receivable_Line as line', 'line.id', 'coding.egcs_fc_receivableline')
      .innerJoin('Funding_Case_Agreement_Account_Receivable as debt', 'debt.id', 'coding.egcs_fc_receivable')
      .select(['coding.egcs_fc_commitmentline', 'coding.egcs_fc_chartofaccount', 'coding.egcs_fc_periodstart', 'coding.egcs_fc_periodend', databaseMoneyText(sql.ref('coding.egcs_fc_amount')).as('amount')])
      .where('line.egcs_fc_originalline', '=', String(allocation.egcs_fc_receivableline)).where('debt.egcs_fc_outcome', '=', 'posted')
      .where('coding._deleted', '=', false).where('line._deleted', '=', false).where('debt._deleted', '=', false).execute()
    const splits = allocateRetainedAccountReceivableCoding(allocation.egcs_fc_amount, coding.map(row => {
      const principal = sumMoney([row.egcs_fc_amount, ...adjustments.filter(adjustment => String(adjustment.egcs_fc_commitmentline) === String(row.egcs_fc_commitmentline)
        && String(adjustment.egcs_fc_chartofaccount) === String(row.egcs_fc_chartofaccount) && adjustment.egcs_fc_periodstart === row.egcs_fc_periodstart
        && adjustment.egcs_fc_periodend === row.egcs_fc_periodend).map(adjustment => parseDatabaseMoney(adjustment.amount))])
      const recovered = sumMoney(postings.filter(posting => String(posting.egcs_fc_coding) === String(row.id)).map(posting => parseDatabaseMoney(posting.amount)))
      const bounds = [subtractMoney(principal, recovered), subtractMoney(row.egcs_fc_paidbasis, recovered), paidCapacity.get(`${allocation.egcs_fc_fundingagreement}:${row.egcs_fc_agencychartofaccount}`) ?? ZERO]
      const capacity = bounds.reduce((minimum, bound) => moneyToCents(bound) < moneyToCents(minimum) ? bound : minimum)
      return { id: String(row.id), basis: principal, capacity }
    }))
    // Different source lines and paid periods can share one current Agency coding pool.
    for (const split of splits.filter(row => moneyToCents(row.amount) > BigInt(0))) {
      const row = coding.find(item => String(item.id) === split.id)!
      const key = `${allocation.egcs_fc_fundingagreement}:${row.egcs_fc_agencychartofaccount}`
      const remaining = subtractMoney(paidCapacity.get(key) ?? ZERO, split.amount)
      if (moneyToCents(remaining) < BigInt(0)) throw new Error('AR_CODING_CAPACITY')
      paidCapacity.set(key, remaining)
    }
    for (const split of splits.filter(row => moneyToCents(row.amount) > BigInt(0))) {
      const row = coding.find(item => String(item.id) === split.id)!
      await trx.insertInto('Funding_Case_Account_Receivable_Posting').values({ egcs_fc_recovery: recoveryId, egcs_fc_allocation: String(allocation.id), egcs_fc_coding: split.id,
        egcs_fc_receivable: String(allocation.egcs_fc_receivable), egcs_fc_fundingagreement: String(allocation.egcs_fc_fundingagreement),
        egcs_fc_accountreceivablechartofaccount: String(sourceLine.egcs_fc_accountreceivablechartofaccount),
        egcs_fc_accountreceivableaccountingdimensions: sql`${JSON.stringify(sourceLine.egcs_fc_accountreceivableaccountingdimensions)}::jsonb`,
        egcs_fc_commitmentline: String(row.egcs_fc_commitmentline), egcs_fc_chartofaccount: String(row.egcs_fc_chartofaccount),
        egcs_fc_agencychartofaccount: String(row.egcs_fc_agencychartofaccount), egcs_fc_agencyfiscalyear: String(row.egcs_fc_agencyfiscalyear),
        egcs_fc_periodstart: row.egcs_fc_periodstart, egcs_fc_periodend: row.egcs_fc_periodend, egcs_fc_amount: databaseMoneyValue(split.amount) }).execute()
    }
  }
  await trx.updateTable('Funding_Case_Account_Receivable_Recovery').set({ egcs_fc_outcome: 'posted', egcs_fc_postingruntime: runtimeId, egcs_fc_postedat: new Date() }).where('id', '=', recoveryId).where('egcs_fc_outcome', '=', 'open').execute()
}

export const postAccountReceivablePaymentOffset = async (trx: Transaction<Database>, paymentId: string, runtimeId: string, actorId?: string) => {
  if (!await hasAccountingTable(trx, 'Funding_Case_Agreement_Account_Receivable')) return
  if (!actorId) throw new Error('AR_OFFSET_ACTOR_REQUIRED')
  const recovery = await trx.selectFrom('Funding_Case_Account_Receivable_Recovery').select(['id', 'egcs_fc_outcome', 'egcs_fc_postingruntime'])
    .where('egcs_fc_payment', '=', paymentId).where('egcs_fc_outcome', 'in', ['open', 'posted']).where('_deleted', '=', false).executeTakeFirst()
  if (!recovery) return
  if (recovery.egcs_fc_outcome === 'posted' && String(recovery.egcs_fc_postingruntime) === runtimeId) return
  const run = await trx.selectFrom('Common_Runtime as runtime').innerJoin('Common_Workflow_Run as run', 'run.id', 'runtime.id')
    .innerJoin('Common_Completion as completion', 'completion.id', 'run.egcs_cn_completion')
    .select(['run.egcs_cn_routing', 'completion.id as completionId'])
    .where('runtime.id', '=', runtimeId).where('runtime.egcs_cn_entitytype', '=', 'fundingcasepayment').where('runtime.egcs_cn_entityid', '=', paymentId)
    .where('runtime.egcs_cn_purpose', '=', 'approval_submission').where('completion.egcs_cn_disposition', '=', 'workflow_started')
    .where('runtime._deleted', '=', false).where('completion._deleted', '=', false).executeTakeFirst()
  if (!run) throw new Error('AR_OFFSET_COMPLETION_REQUIRED')
  const latest = await trx.selectFrom('Common_Runtime as runtime').innerJoin('Common_Workflow_Run as run', 'run.id', 'runtime.id')
    .select('runtime.id').where('run.egcs_cn_completion', '=', String(run.completionId)).where('runtime._deleted', '=', false)
    .orderBy('runtime.egcs_cn_attempt', 'desc').orderBy('runtime.id', 'desc').executeTakeFirstOrThrow()
  if (String(latest.id) !== runtimeId) throw new Error('AR_OFFSET_WORKFLOW_SUPERSEDED')
  const routing = run.egcs_cn_routing as { paymentOffsetPacket?: JsonValue; paymentOffsetPacketHash?: string } | null
  if (!routing?.paymentOffsetPacket || !routing.paymentOffsetPacketHash || hashPublicationDefinition(routing.paymentOffsetPacket) !== routing.paymentOffsetPacketHash) throw new Error('AR_OFFSET_PACKET_INTEGRITY')
  const stages = await trx.selectFrom('Common_Runtime_Item').select('egcs_cn_state')
    .where('egcs_cn_runtime', '=', runtimeId).where('egcs_cn_parentruntimeitem', 'is', null).where('_deleted', '=', false).execute()
  if (!stages.length || stages.some(row => !['succeeded', 'approved'].includes(row.egcs_cn_state))) throw new Error('AR_OFFSET_WORKFLOW_INCOMPLETE')
  await validateAccountReceivablePaymentOffset(trx, paymentId, { packet: routing.paymentOffsetPacket })
  const basis = await hasAccountReceivablePoolLedger(trx)
    ? await trx.selectFrom('Funding_Case_Account_Receivable_Recovery').select('egcs_fc_ledgerkind').where('id', '=', String(recovery.id)).executeTakeFirstOrThrow()
    : { egcs_fc_ledgerkind: 'legacy' }
  if (basis.egcs_fc_ledgerkind === 'pool') {
    await trx.updateTable('Funding_Case_Account_Receivable_Recovery').set({ egcs_fc_outcome: 'posted', egcs_fc_postingruntime: runtimeId, egcs_fc_postedat: new Date() })
      .where('id', '=', String(recovery.id)).where('egcs_fc_outcome', '=', 'open').execute()
  } else await postAccountReceivableRecovery(trx, String(recovery.id), runtimeId)
}
