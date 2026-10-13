/* eslint-disable jsdoc/require-jsdoc -- Bound host financial contract, with no financial source identities exposed. */
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Currency_Codes, Database } from '~~/shared/types/database'
import { formatAccountingDimensions } from '~~/shared/utils/accounting-dimensions'
import { TransferPaymentStreamChartOfAccountDimensionSchema } from '~~/shared/types/schemas/transfer-payment'
import { getAgreementAccountingCodingPools } from './agreement-accounting-projection'
import { hasPositiveCompletionTerminus } from './completion-terminus'
import { agreementPaymentApprovalIsEligible, agreementPaymentIsFinal } from './agreement-payment-source'

type DbClient = Kysely<Database> | Transaction<Database>
const releasedRuntimeStates = ['denied', 'unsuccessful', 'cancelled', 'failed']

export const hasAgreementPendingAllocationEffects = async (db: DbClient, agreementId: string): Promise<boolean> => {
  const result = await sql<{ pending: boolean }>`SELECT (
    EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Payment" payment
      WHERE payment.egcs_fc_fundingagreement = ${agreementId} AND NOT payment._deleted
        AND ${agreementPaymentApprovalIsEligible('payment')}
        AND NOT (COALESCE((
          SELECT runtime.egcs_cn_state IN (${sql.join(releasedRuntimeStates)})
          FROM "Common_Completion" completion
          JOIN "Common_Workflow_Run" run ON run.egcs_cn_completion = completion.id
          JOIN "Common_Runtime" runtime ON runtime.id = run.id
          WHERE completion.egcs_cn_entitytype = 'fundingcasepayment' AND completion.egcs_cn_entityid = payment.id
            AND completion.egcs_cn_disposition = 'workflow_started' AND NOT completion._deleted AND NOT runtime._deleted
          ORDER BY runtime.egcs_cn_attempt DESC, runtime.id DESC LIMIT 1
        ), FALSE) AND NOT EXISTS (
          SELECT 1 FROM "Funding_Case_Agreement_Payment_Line" reservation
          WHERE reservation.egcs_fc_fundingagreementpayment = payment.id AND NOT reservation._deleted
            AND reservation.egcs_fc_amount <> 0
        ))
        AND NOT (${agreementPaymentIsFinal('payment', { requireResolvedApproval: true })}))
    OR EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Correction" correction
      WHERE correction.egcs_fc_fundingagreement = ${agreementId} AND NOT correction._deleted
        AND correction.egcs_fc_outcome = 'open')
    OR EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Credit_Memo" memo
      JOIN "Funding_Case_Account_Receivable_Credit_Memo_Line" line ON line.egcs_fc_creditmemo = memo.id
      JOIN "Funding_Case_Agreement_Account_Receivable" debt ON debt.id = line.egcs_fc_receivable
      WHERE debt.egcs_fc_fundingagreement = ${agreementId} AND NOT debt._deleted
        AND NOT memo._deleted AND memo.egcs_fc_outcome = 'open' AND NOT line._deleted
        AND line.egcs_fc_commitmentchartofaccount IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Offset_Memo" memo
      JOIN "Funding_Case_Agreement_Account_Receivable" debt ON debt.id = memo.egcs_fc_receivable
      JOIN "Funding_Case_Account_Receivable_Offset_Memo_Line" line ON line.egcs_fc_offsetmemo = memo.id
      JOIN "Funding_Case_Account_Receivable_Offset_Memo_Application" application ON application.egcs_fc_offsetmemo = memo.id
      JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id = application.egcs_fc_recovery
      WHERE debt.egcs_fc_fundingagreement = ${agreementId} AND NOT debt._deleted AND NOT memo._deleted
        AND NOT application._deleted AND NOT recovery._deleted AND recovery.egcs_fc_outcome = 'open'
        AND NOT line._deleted AND line.egcs_fc_commitmentchartofaccount IS NOT NULL)
  ) AS pending`.execute(db)
  if (result.rows[0]?.pending === true) return true
  const vouchers = await db.selectFrom('Funding_Case_Agreement_Journal_Voucher as voucher')
    .innerJoin('Common_Status as status', 'status.id', 'voucher.egcs_fc_status')
    .select(['voucher.id', 'status.egcs_cn_terminal as terminal'])
    .where('voucher.egcs_fc_fundingagreement', '=', agreementId).where('voucher._deleted', '=', false).execute()
  for (const voucher of vouchers) {
    if (await hasPositiveCompletionTerminus(db, 'fundingcasejournalvoucher', String(voucher.id))) continue
    const latest = await db.selectFrom('Common_Workflow_Run as run')
      .innerJoin('Common_Runtime as runtime', 'runtime.id', 'run.id')
      .select('runtime.egcs_cn_state as state')
      .where('runtime.egcs_cn_entitytype', '=', 'fundingcasejournalvoucher').where('runtime.egcs_cn_entityid', '=', String(voucher.id))
      .where('runtime._deleted', '=', false).orderBy('runtime.egcs_cn_attempt', 'desc').orderBy('runtime.id', 'desc').executeTakeFirst()
    if (latest && releasedRuntimeStates.includes(latest.state)) continue
    if (latest || !voucher.terminal) return true
  }
  return false
}

export const getAgreementCostAllocationContext = async (db: DbClient, agreementId: string, currency: Currency_Codes) => {
  const hasPendingEffects = await hasAgreementPendingAllocationEffects(db, agreementId)
  const pools = await getAgreementAccountingCodingPools(db, agreementId)
  const accounts = await db.selectFrom('Agency_Chart_of_Account as account')
    .innerJoin('Transfer_Payment_Profile as program', 'program.egcs_tp_agency', 'account.egcs_ay_organizationagency')
    .innerJoin('Transfer_Payment_Stream as stream', 'stream.egcs_tp_transferpaymentprofile', 'program.id')
    .innerJoin('Funding_Case_Agreement_Profile as agreement', 'agreement.egcs_fc_transferpaymentstream', 'stream.id')
    .innerJoin('Agency_Fiscal_Year as year', 'year.id', 'account.egcs_ay_fiscalyear')
    .select(['account.id', 'account.egcs_ay_fiscalyear', 'account.egcs_ay_accountingdimensions', 'year.egcs_ay_fiscalyeardisplay'])
    .where('agreement.id', '=', agreementId).where('account.egcs_ay_currency', '=', currency)
    .where('account.egcs_ay_kind', '=', 'commitment').execute()
  return { agreementId, hasPendingEffects, codingPaidAmounts: accounts.flatMap(account => {
    const paid = pools.get(String(account.id))?.paid
    const dimensions = TransferPaymentStreamChartOfAccountDimensionSchema.array().parse(account.egcs_ay_accountingdimensions)
    return paid === undefined
      ? []
      : [{ agencyChartOfAccountId: String(account.id), agencyFiscalYearId: String(account.egcs_ay_fiscalyear),
          labelEn: formatAccountingDimensions(dimensions, 'en'), labelFr: formatAccountingDimensions(dimensions, 'fr'),
          fiscalYearDisplay: account.egcs_ay_fiscalyeardisplay, paidAmount: paid }]
  }) }
}
