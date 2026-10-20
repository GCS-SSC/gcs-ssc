import { applyAccountReceivableClaimReductions } from './account-receivable-claim-reductions'
/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Narrow engine-owned Payment controls, reservations and exact principal allocation. */
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Currency_Codes, Database, JsonValue } from '~~/shared/types/database'
import { moneyFromCents, moneyToCents, parseMoney, subtractMoney, sumMoney, type Money } from '~~/shared/utils/money'
import { resolveAgreementScopeContext } from './agreement'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { readAccountReceivableApprovedRecoveryMethod } from './account-receivable'
import { lockAccountReceivablePaymentPoolAgreements } from './account-receivable-context'
import { hashPublicationDefinition } from './system-publication'
import { linkAccountReceivablePoolOffsetApplication, readAccountReceivablePaymentCreditMemos, readPinnedAccountReceivablePaymentCreditMemos, readAccountReceivableOffsetMemoLines } from './account-receivable-offset-memo'
import { readAccountReceivablePoolBalance, readAccountReceivablePoolOffsetPolicy, captureAccountReceivablePoolBasis } from './account-receivable-pool-ledger'

import type { PaymentOffsetCodingPlan } from './agreement-payment-offset-plan'
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
    result.push({ ...debt, egcs_fc_recoverymethod: await readAccountReceivableApprovedRecoveryMethod(db, String(debt.id)) })
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
  const context = await resolveAgreementScopeContext(input.agreementId, db)
  if (!context) throw new Error('AR_PAYMENT_OWNER_UNAVAILABLE')
  const pools = await db.selectFrom('Funding_Case_Account_Receivable_Pool').selectAll().where('egcs_fc_agency', '=', context.agencyId)
    .where('egcs_fc_applicantrecipient', '=', input.applicantRecipientId).where('_deleted', '=', false).execute()
  for (const pool of pools) {
    const balance = await readAccountReceivablePoolBalance(db, String(pool.id))
    if (moneyToCents(balance.egcs_fc_receivableamount) > BigInt(0) && await readAccountReceivablePoolOffsetPolicy(db, String(pool.id)) === 'direct_repayment') throw new Error('AR_DIRECT_REPAYMENT_HOLD')
    if (pool.egcs_fc_currency !== input.currency) continue
    let pending = db.selectFrom('Funding_Case_Account_Receivable_Recovery').select('id').where('egcs_fc_pool', '=', String(pool.id))
      .where('egcs_fc_outcome', '=', 'open').where('_deleted', '=', false)
    if (input.paymentId) pending = pending.where('egcs_fc_payment', '!=', input.paymentId)
    if (await db.selectFrom('Funding_Case_Account_Receivable_Credit_Memo').select('id')
      .where('egcs_fc_pool', '=', String(pool.id)).where('egcs_fc_outcome', '=', 'open').where('_deleted', '=', false).executeTakeFirst()) throw new Error('AR_RECOVERY_UNRESOLVED')
    if (await pending.executeTakeFirst()) throw new Error('AR_RECOVERY_UNRESOLVED')
    if (await db.selectFrom('Funding_Case_Agreement_Account_Receivable').select('id').where('egcs_fc_pool', '=', String(pool.id))
      .where('egcs_fc_linkedreceivable', 'is not', null).where('egcs_fc_outcome', '=', 'open').where('_deleted', '=', false).executeTakeFirst()) throw new Error('AR_ADJUSTMENT_UNRESOLVED')
  }
}

export const releaseAccountReceivablePaymentOffset = async (trx: Transaction<Database>, paymentId: string) => {
  await trx.updateTable('Funding_Case_Account_Receivable_Recovery').set({ egcs_fc_outcome: 'released', egcs_fc_releasedat: new Date() })
    .where('egcs_fc_payment', '=', paymentId).where('egcs_fc_outcome', '=', 'open').where('_deleted', '=', false).execute()
}

export const rebuildAccountReceivablePaymentOffset = async (trx: Transaction<Database>, paymentId: string, options: { plans?: PaymentOffsetCodingPlan[] } = {}) => {
  const payment = await trx.selectFrom('Funding_Case_Agreement_Payment').selectAll()
    .select(databaseMoneyText(sql.ref('egcs_fc_paymentamount')).as('gross')).where('id', '=', paymentId).where('_deleted', '=', false).executeTakeFirstOrThrow()
  const context = await resolveAgreementScopeContext(String(payment.egcs_fc_fundingagreement), trx)
  if (!context) throw new Error('AR_PAYMENT_OWNER_UNAVAILABLE')
  const { pool } = await lockAccountReceivablePaymentPoolAgreements(trx, { agencyId: context.agencyId,
    applicantRecipientId: String(payment.egcs_fc_applicantrecipient), currency: payment.egcs_fc_currency, agreementId: context.agreementId })
  const completion = await trx.selectFrom('Common_Completion').select('id').where('egcs_cn_entitytype', '=', 'fundingcasepayment')
    .where('egcs_cn_entityid', '=', paymentId).where('_deleted', '=', false).executeTakeFirst()
  if (completion) throw new Error('AR_OFFSET_PINNED')
  await assertAccountReceivablePaymentAllowed(trx, { agreementId: context.agreementId, applicantRecipientId: String(payment.egcs_fc_applicantrecipient), currency: payment.egcs_fc_currency, paymentId })
  const current = await trx.selectFrom('Funding_Case_Account_Receivable_Recovery').select('id')
    .where('egcs_fc_payment', '=', paymentId).where('egcs_fc_outcome', '=', 'open').where('_deleted', '=', false).executeTakeFirst()
  const retained = current
    ? await trx.selectFrom('Funding_Case_Account_Receivable_Offset_Memo as memo')
        .innerJoin('Funding_Case_Account_Receivable_Offset_Memo_Application as application', 'application.egcs_fc_offsetmemo', 'memo.id')
        .select(['memo.id', 'memo.egcs_fc_receivable', databaseMoneyText(sql.ref('memo.egcs_fc_amount')).as('amount')])
        .where('application.egcs_fc_recovery', '=', String(current.id)).orderBy('memo.id').execute()
    : []
  const debts = await readAccountReceivablePoolDebts(trx, { agencyId: context.agencyId,
    applicantRecipientId: String(payment.egcs_fc_applicantrecipient), currency: payment.egcs_fc_currency })
  let remaining = moneyToCents(parseDatabaseMoney(payment.gross))
  const plans: Array<{ receivableId: string; amount: Money }> = []
  for (const debt of debts.filter(item => item.egcs_fc_recoverymethod === 'offset')) {
    const balance = await readAccountReceivableCashBalance(trx, String(debt.id))
    const reservedHere = sumMoney(retained.filter(memo => String(memo.egcs_fc_receivable) === String(debt.id)).map(memo => parseDatabaseMoney(memo.amount)))
    const available = moneyToCents(balance.egcs_fc_available) + moneyToCents(reservedHere)
    const amount = available < remaining ? available : remaining
    if (amount <= BigInt(0)) continue
    plans.push({ receivableId: String(debt.id), amount: moneyFromCents(amount) })
    remaining -= amount
    if (remaining <= BigInt(0)) break
  }
  const sameRetainedPlan = retained.length === plans.length && plans.every(plan => retained.some(memo => String(memo.egcs_fc_receivable) === plan.receivableId && parseDatabaseMoney(memo.amount) === plan.amount))
  if (sameRetainedPlan && current) {
    let sameCoding = true
    for (const memo of retained) {
      const lines = await readAccountReceivableOffsetMemoLines(trx, String(memo.id))
      if (!lines.length || sumMoney(lines.map(line => line.egcs_fc_amount)) !== parseDatabaseMoney(memo.amount)) throw new Error('AR_OFFSET_CODING_REQUIRED')
      if (options.plans) {
        const proposed = options.plans.find(plan => plan.receivableId === String(memo.egcs_fc_receivable))?.coding.map(line => ({
          codingLineId: line.codingLineId, accountId: line.agencyChartOfAccountId, dimensions: line.accountingDimensions,
          commitmentId: line.commitmentChartOfAccountId ?? null, amount: line.amount }))
        const retainedCoding = lines.map(line => ({ codingLineId: line.egcs_fc_transferpaymentstreamchartofaccount,
          accountId: line.egcs_fc_creditmemochartofaccount, dimensions: line.egcs_fc_creditmemoaccountingdimensions,
          commitmentId: line.egcs_fc_commitmentchartofaccount, amount: line.egcs_fc_amount }))
        sameCoding &&= proposed !== undefined && hashPublicationDefinition(json(proposed)) === hashPublicationDefinition(json(retainedCoding))
      }
    }
    if (sameCoding) return await readAccountReceivablePaymentOffset(trx, paymentId)
  }
  if (plans.length && (!options.plans || options.plans.length !== plans.length || !plans.every(plan => options.plans!.some(selected => selected.receivableId === plan.receivableId && selected.amount === plan.amount)))) throw new Error('AR_OFFSET_CODING_REQUIRED')
  if (!plans.length && options.plans?.length) throw new Error('AR_OFFSET_PLAN_CHANGED')
  await releaseAccountReceivablePaymentOffset(trx, paymentId)
  if (plans.length) {
    const amount = sumMoney(plans.map(plan => plan.amount))
    const recovery = await trx.insertInto('Funding_Case_Account_Receivable_Recovery').values({ egcs_fc_pool: String(pool.id), egcs_fc_payment: paymentId,
      egcs_fc_amount: databaseMoneyValue(amount) }).returning('id').executeTakeFirstOrThrow()
    await linkAccountReceivablePoolOffsetApplication(trx, String(recovery.id), options.plans!)
  }
  return await readAccountReceivablePaymentOffset(trx, paymentId)
}

/** Deliberately omits rationale, source data, sibling Agreement identity and debt navigation. */
export const readAccountReceivablePaymentOffset = async (db: Kysely<Database>, paymentId: string, options: { liveMemoBalances?: boolean } = {}) => {
  const payment = await db.selectFrom('Funding_Case_Agreement_Payment').select(['egcs_fc_fundingagreement', 'egcs_fc_applicantrecipient', 'egcs_fc_currency'])
    .select(sql<boolean>`EXISTS (SELECT 1 FROM "Common_Status" status WHERE status.id = "Funding_Case_Agreement_Payment".egcs_fc_status AND status.egcs_cn_terminal AND NOT status._deleted)`.as('egcs_fc_isterminal'))
    .select(databaseMoneyText(sql.ref('egcs_fc_paymentamount')).as('gross')).where('id', '=', paymentId).executeTakeFirstOrThrow()
  const recoveries = await db.selectFrom('Funding_Case_Account_Receivable_Recovery').select(['id', 'egcs_fc_outcome'])
    .select(databaseMoneyText(sql.ref('egcs_fc_amount')).as('amount')).where('egcs_fc_payment', '=', paymentId)
    .where('egcs_fc_outcome', 'in', ['open', 'posted']).where('_deleted', '=', false).execute()
  const settled = payment.egcs_fc_isterminal || recoveries.some(recovery => recovery.egcs_fc_outcome === 'posted')
  const retainedRecovery = recoveries[0] ?? await db.selectFrom('Funding_Case_Account_Receivable_Recovery')
    .select(['id', 'egcs_fc_outcome']).where('egcs_fc_payment', '=', paymentId).where('_deleted', '=', false).orderBy('id', 'desc').executeTakeFirst()
  const gross = parseDatabaseMoney(payment.gross)
  const offset = sumMoney(recoveries.map(row => parseDatabaseMoney(row.amount)))
  let control: 'allowed' | 'direct_repayment_hold' | 'recovery_pending' = 'allowed'
  if (!settled) {
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
    egcs_fc_recoverycontrol: control,
    egcs_fc_creditmemos: options.liveMemoBalances
      ? await readAccountReceivablePaymentCreditMemos(db, retainedRecovery ? String(retainedRecovery.id) : undefined)
      : (await readPinnedAccountReceivablePaymentCreditMemos(db, paymentId).then(async pinned => pinned.length
          ? pinned :
            (await readAccountReceivablePaymentCreditMemos(db, retainedRecovery ? String(retainedRecovery.id) : undefined)).map(({ egcs_fc_receivablereserved: _reserved,
              egcs_fc_receivablerecovered: _recovered, egcs_fc_receivableoutstanding: _outstanding,
              egcs_fc_receivableavailable: _available, ...memo }) => memo))).map(memo => ({ ...memo,
          egcs_fc_outcome: retainedRecovery?.egcs_fc_outcome ?? memo.egcs_fc_outcome,
          egcs_fc_appliedamount: retainedRecovery?.egcs_fc_outcome === 'released' ? ZERO : memo.egcs_fc_appliedamount })) }
}

export const captureAccountReceivablePaymentOffsetPacket = async (db: Kysely<Database>, paymentId: string) => {
  const summary = await readAccountReceivablePaymentOffset(db, paymentId, { liveMemoBalances: true })
  const payment = await db.selectFrom('Funding_Case_Agreement_Payment as payment')
    .innerJoin('Funding_Case_Agreement_Profile as agreement', 'agreement.id', 'payment.egcs_fc_fundingagreement')
    .leftJoin('Applicant_Recipient_Profile as payee', 'payee.id', 'payment.egcs_fc_applicantrecipient')
    .select(['payment.egcs_fc_currency', 'payment.egcs_fc_fundingagreement', 'agreement.egcs_fc_agreementnumber',
      'payment.egcs_fc_applicantrecipient', 'payment.egcs_fc_paymenttype',
      'payee.egcs_ar_legalname_en as egcs_fc_payeename_en', 'payee.egcs_ar_legalname_fr as egcs_fc_payeename_fr'])
    .where('payment.id', '=', paymentId).executeTakeFirstOrThrow()
  const owner = await resolveAgreementScopeContext(String(payment.egcs_fc_fundingagreement), db)
  if (owner) {
    const pool = await db.selectFrom('Funding_Case_Account_Receivable_Pool').select('id').where('egcs_fc_agency', '=', owner.agencyId)
      .where('egcs_fc_applicantrecipient', '=', String(payment.egcs_fc_applicantrecipient)).where('egcs_fc_currency', '=', payment.egcs_fc_currency).executeTakeFirst()
    return { schemaVersion: 5 as const, ...summary, payment: { ...payment, egcs_fc_paymentamount: summary.egcs_fc_grossamount },
      poolBasisHash: pool ? hashPublicationDefinition(json(await captureAccountReceivablePoolBasis(db, String(pool.id)))) : null }
  }
  return { schemaVersion: 5 as const, ...summary, payment: { ...payment, egcs_fc_paymentamount: summary.egcs_fc_grossamount },
    poolBasisHash: null }
}

export const validateAccountReceivablePaymentOffset = async (trx: Transaction<Database>, paymentId: string, options: { packet?: JsonValue } = {}) => {
  const payment = await trx.selectFrom('Funding_Case_Agreement_Payment').select(['egcs_fc_fundingagreement', 'egcs_fc_applicantrecipient', 'egcs_fc_currency']).where('id', '=', paymentId).executeTakeFirstOrThrow()
  await assertAccountReceivablePaymentAllowed(trx, { agreementId: String(payment.egcs_fc_fundingagreement), applicantRecipientId: String(payment.egcs_fc_applicantrecipient), currency: payment.egcs_fc_currency, paymentId })
  const packet = await captureAccountReceivablePaymentOffsetPacket(trx, paymentId)
  if (options.packet && hashPublicationDefinition(json(packet)) !== hashPublicationDefinition(options.packet)) throw new Error('AR_OFFSET_BASIS_CHANGED')
  if (moneyToCents(packet.egcs_fc_netamount) < BigInt(0)) throw new Error('AR_OFFSET_EXCEEDS_GROSS')
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

export const postAccountReceivablePaymentOffset = async (trx: Transaction<Database>, paymentId: string, runtimeId: string, actorId?: string) => {
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
  await trx.updateTable('Funding_Case_Account_Receivable_Recovery').set({ egcs_fc_outcome: 'posted', egcs_fc_postingruntime: runtimeId, egcs_fc_postedat: new Date() })
    .where('id', '=', String(recovery.id)).where('egcs_fc_outcome', '=', 'open').execute()
  const cleared = await trx.selectFrom('Funding_Case_Account_Receivable_Offset_Memo as memo')
    .innerJoin('Funding_Case_Account_Receivable_Offset_Memo_Application as application', 'application.egcs_fc_offsetmemo', 'memo.id')
    .select('memo.egcs_fc_receivable').where('application.egcs_fc_recovery', '=', String(recovery.id)).execute()
  for (const receivableId of new Set(cleared.map(row => String(row.egcs_fc_receivable)))) await applyAccountReceivableClaimReductions(trx, receivableId)
}
