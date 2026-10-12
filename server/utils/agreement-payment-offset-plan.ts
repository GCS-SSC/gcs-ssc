/* eslint-disable jsdoc/require-jsdoc -- Payment creation retains an explicit, exact, user-reviewed offset coding plan. */
import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import { sql } from 'kysely'
import { getGcsExtensions } from '#gcs-extensions/server-registry'
import type { Database, JsonValue } from '~~/shared/types/database'
import type { PaymentOffsetPreview } from '~~/shared/types/account-receivable'
import type { FundingCaseAgreementPaymentCreate } from '~~/shared/types/schemas'
import { compareMoney, moneyToCents, moneyFromCents, parseMoney, sumMoney, subtractMoney, type Money } from '~~/shared/utils/money'
import { TransferPaymentStreamChartOfAccountDimensionSchema } from '~~/shared/types/schemas'
import { allocateAgreementCoding, validateCodingAllocation, type AgreementCodingAllocation } from './agreement-coding-allocator'
import { readAccountReceivablePoolDebts } from './account-receivable-recovery'
import { readAccountReceivableCashBalance } from './account-receivable-cash-balance'
import { captureAccountReceivablePoolBasis } from './account-receivable-pool-ledger'
import { resolveAgreementScopeContext } from './agreement'
import { assertPaymentRecoveryAllowed, withPaymentRecoveryErrors } from './payment-recovery-controls'
import { hashPublicationDefinition } from './system-publication'
import type { GcsCodingAllocationCatalogLine } from '@gcs-ssc/extensions/server'
import { databaseMoneyText, parseDatabaseMoney } from './database-money'

export type PaymentOffsetCodingPlan = { receivableId: string; amount: Money; coding: AgreementCodingAllocation[] }
type PreparedPaymentOffsetPlan = {
  preview: PaymentOffsetPreview
  plans: Array<{ receivableId: string; amount: Money; catalog: GcsCodingAllocationCatalogLine[]; allocated: AgreementCodingAllocation[] | null }>
}
const asJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue
const ZERO = parseMoney('0.00')

export const prepareAgreementPaymentOffsetPlan = async (
  event: H3Event, trx: Transaction<Database>,
  context: { agreementId: string; agencyId: string; streamId: string }, header: FundingCaseAgreementPaymentCreate,
  options: { paymentId?: string } = {}
): Promise<PreparedPaymentOffsetPlan> => {
  await assertPaymentRecoveryAllowed(event, trx, { agreementId: context.agreementId,
    applicantRecipientId: header.egcs_fc_applicantrecipient, currency: header.egcs_fc_currency, paymentId: options.paymentId })
  const debts = await readAccountReceivablePoolDebts(trx, { agencyId: context.agencyId,
    applicantRecipientId: header.egcs_fc_applicantrecipient, currency: header.egcs_fc_currency })
  const pool = await trx.selectFrom('Funding_Case_Account_Receivable_Pool').select('id')
    .where('egcs_fc_agency', '=', context.agencyId).where('egcs_fc_applicantrecipient', '=', header.egcs_fc_applicantrecipient)
    .where('egcs_fc_currency', '=', header.egcs_fc_currency).where('_deleted', '=', false).executeTakeFirst()
  const plans: PreparedPaymentOffsetPlan['plans'] = []
  const creditMemos: PaymentOffsetPreview['egcs_fc_creditmemos'] = []
  const allocatorScopes: unknown[] = []
  const reservedHere = options.paymentId
    ? await trx.selectFrom('Funding_Case_Account_Receivable_Offset_Memo as memo')
        .innerJoin('Funding_Case_Account_Receivable_Offset_Memo_Application as application', 'application.egcs_fc_offsetmemo', 'memo.id')
        .innerJoin('Funding_Case_Account_Receivable_Recovery as recovery', 'recovery.id', 'application.egcs_fc_recovery')
        .select(['memo.egcs_fc_receivable', databaseMoneyText(sql.ref('memo.egcs_fc_amount')).as('amount')])
        .where('recovery.egcs_fc_payment', '=', options.paymentId).where('recovery.egcs_fc_outcome', '=', 'open')
        .where('recovery._deleted', '=', false).execute()
    : []
  let remaining = moneyToCents(header.egcs_fc_paymentamount)
  for (const debt of debts.filter(item => item.egcs_fc_recoverymethod === 'offset')) {
    const ownReserved = sumMoney(reservedHere.filter(memo => String(memo.egcs_fc_receivable) === String(debt.id)).map(memo => parseDatabaseMoney(memo.amount)))
    const available = moneyToCents((await readAccountReceivableCashBalance(trx, String(debt.id))).egcs_fc_available) + moneyToCents(ownReserved)
    const cents = available < remaining ? available : remaining
    if (cents <= BigInt(0)) continue
    const amount = moneyFromCents(cents)
    const owner = await resolveAgreementScopeContext(String(debt.egcs_fc_fundingagreement), trx)
    if (!owner || owner.agencyId !== context.agencyId) throw new Error('AR_PAYMENT_OWNER_UNAVAILABLE')
    const rows = await trx.selectFrom('Transfer_Payment_Stream_Chart_of_Account as selection')
      .innerJoin('Agency_Chart_of_Account as account', 'account.id', 'selection.egcs_tp_agencychartofaccount')
      .select(['selection.id as codingLineId', 'account.id as agencyChartOfAccountId', 'account.egcs_ay_fiscalyear as agencyFiscalYearId',
        'account.egcs_ay_accountingdimensions as accountingDimensions', 'account.egcs_ay_commitmentchartofaccount as commitmentChartOfAccountId'])
      .where('selection.egcs_tp_transferpaymentstream', '=', owner.streamId).where('selection._deleted', '=', false)
      .where('account.egcs_ay_organizationagency', '=', owner.agencyId).where('account.egcs_ay_kind', '=', 'credit_memo')
      .where('account.egcs_ay_fiscalyear', '=', String(debt.egcs_fc_agencyfiscalyear))
      .where('account.egcs_ay_currency', '=', header.egcs_fc_currency).where('account._deleted', '=', false)
      .orderBy('selection.id').forShare('selection').forShare('account').execute()
    const catalog: GcsCodingAllocationCatalogLine[] = rows.map(row => ({ ...row, codingLineId: String(row.codingLineId),
      agencyChartOfAccountId: String(row.agencyChartOfAccountId), agencyFiscalYearId: String(row.agencyFiscalYearId),
      commitmentChartOfAccountId: row.commitmentChartOfAccountId === null ? null : String(row.commitmentChartOfAccountId) }))
    const allocated = await allocateAgreementCoding(event, trx, { agreementId: owner.agreementId, agencyId: owner.agencyId,
      streamId: owner.streamId, amount, currency: header.egcs_fc_currency, agencyFiscalYearId: String(debt.egcs_fc_agencyfiscalyear),
      output: { kind: 'credit-memo' } })
    // Bind enabled provider configuration even when it explicitly returns null for this output.
    for (const extension of getGcsExtensions()) {
      if (!extension.codingAllocator) continue
      const agency = await trx.selectFrom('extensions.agency_enablement').select(['enabled', 'config'])
        .where('extension_key', '=', extension.key).where('agency_id', '=', owner.agencyId).where('_deleted', '=', false).forShare().executeTakeFirst()
      const stream = extension.configurationScope === 'agency'
        ? null
        : await trx.selectFrom('extensions.stream_configuration')
            .select(['enabled', 'config']).where('extension_key', '=', extension.key).where('stream_id', '=', owner.streamId)
            .where('_deleted', '=', false).forShare().executeTakeFirst()
      allocatorScopes.push({ extension: extension.key, contribution: extension.codingAllocator.id, streamId: owner.streamId, agency, stream })
    }
    const key = hashPublicationDefinition(asJson({ pool: String(debt.egcs_fc_pool), receivable: String(debt.id) }))
    const codingAccounts = catalog.map(account => {
      const parsed = TransferPaymentStreamChartOfAccountDimensionSchema.array().safeParse(account.accountingDimensions)
      const dimensions = parsed.success ? parsed.data : []
      return { id: account.codingLineId, egcs_fc_name_en: dimensions.map(dimension => `${dimension.label_en}: ${dimension.value}`).join(' · ') || account.agencyChartOfAccountId,
        egcs_fc_name_fr: dimensions.map(dimension => `${dimension.label_fr}: ${dimension.value}`).join(' · ') || account.agencyChartOfAccountId,
        egcs_fc_accountingdimensions: account.accountingDimensions as JsonValue,
        egcs_fc_commitmentchartofaccount: account.commitmentChartOfAccountId ?? null }
    })
    plans.push({ receivableId: String(debt.id), amount, catalog, allocated })
    creditMemos.push({ egcs_fc_key: key, egcs_fc_amount: amount, egcs_fc_currency: header.egcs_fc_currency,
      egcs_fc_allocationmode: allocated === null ? 'manual' : 'allocator', egcs_fc_codingaccounts: codingAccounts,
      egcs_fc_lines: allocated?.filter(line => compareMoney(line.amount, ZERO) > 0).map(line => ({ egcs_fc_codingaccount: line.codingLineId, egcs_fc_amount: line.amount })) ?? [] })
    remaining -= cents
    if (remaining <= BigInt(0)) break
  }
  const { egcs_fc_offsetplanhash: _priorHash, egcs_fc_offsetcreditmemos: _priorMemos, ...paymentHeader } = header
  const offset = sumMoney(plans.map(plan => plan.amount))
  const hash = hashPublicationDefinition(asJson({ context, paymentHeader, paymentId: options.paymentId ?? null,
    poolBasis: pool && debts.length ? await captureAccountReceivablePoolBasis(trx, String(pool.id)) : null,
    debtBasis: debts.map(debt => ({ id: String(debt.id), method: debt.egcs_fc_recoverymethod, lines: debt.lines })),
    plans, creditMemos, allocatorScopes }))
  return { preview: { egcs_fc_grossamount: header.egcs_fc_paymentamount, egcs_fc_offsetamount: offset,
    egcs_fc_netamount: subtractMoney(header.egcs_fc_paymentamount, offset), egcs_fc_offsetplanhash: hash, egcs_fc_creditmemos: creditMemos }, plans }
}

export const validateAgreementPaymentOffsetPlan = async (
  event: H3Event, prepared: PreparedPaymentOffsetPlan, header: FundingCaseAgreementPaymentCreate
): Promise<PaymentOffsetCodingPlan[]> => await withPaymentRecoveryErrors(event, async () => {
  if (!header.egcs_fc_offsetplanhash) {
    if (prepared.plans.length || header.egcs_fc_offsetcreditmemos?.length) throw new Error('AR_OFFSET_CODING_REQUIRED')
    return []
  }
  if (header.egcs_fc_offsetplanhash !== prepared.preview.egcs_fc_offsetplanhash) throw new Error('AR_OFFSET_PLAN_CHANGED')
  const submitted = header.egcs_fc_offsetcreditmemos ?? []
  if (submitted.length !== prepared.plans.length || new Set(submitted.map(memo => memo.egcs_fc_key)).size !== submitted.length) throw new Error('AR_OFFSET_CODING_REQUIRED')
  return prepared.plans.map((plan, index) => {
    const preview = prepared.preview.egcs_fc_creditmemos[index]!
    const memo = submitted.find(item => item.egcs_fc_key === preview.egcs_fc_key)
    if (!memo) throw new Error('AR_OFFSET_CODING_REQUIRED')
    const result = memo.egcs_fc_lines.map(line => ({ codingLineId: line.egcs_fc_codingaccount, amount: line.egcs_fc_amount }))
    if (plan.allocated && hashPublicationDefinition(asJson(result)) !== hashPublicationDefinition(asJson(preview.egcs_fc_lines.map(line => ({ codingLineId: line.egcs_fc_codingaccount, amount: line.egcs_fc_amount }))))) throw new Error('AR_OFFSET_PLAN_CHANGED')
    try {
      return { receivableId: plan.receivableId, amount: plan.amount, coding: validateCodingAllocation(plan.amount, plan.catalog, result) }
    } catch {
      throw new Error('AR_OFFSET_CODING_INVALID')
    }
  })
})
