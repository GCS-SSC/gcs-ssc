import { readAccountReceivablePaymentOffset } from '~~/server/utils/account-receivable-recovery'
import { requireAuthContext } from '~~/server/utils/authorize'
import { sql } from 'kysely'
import { prepareAgreementPaymentRoute } from '~~/server/utils/agreement-payment'
import { budgetFiscalYearStableId } from '~~/server/utils/agreement-budget-lineage'
import { withBusinessRecordState } from '~~/server/utils/business-record-state'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'

export default defineEventHandler(async event => {
  const prepared = await prepareAgreementPaymentRoute(event, 'read')
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, db, agreementContext } = prepared
  const auth = await requireAuthContext(event)
  const liveMemoBalances = auth.userAbilities.authorize('account_receivable', 'read', { type: 'agency', agencyId: agreementContext.agencyId })

  const payments = await db
    .selectFrom('Funding_Case_Agreement_Payment')
    .leftJoin('Applicant_Recipient_Profile as payee', 'payee.id', 'Funding_Case_Agreement_Payment.egcs_fc_applicantrecipient')
    .innerJoin(
      'Funding_Case_Agreement_Commitment',
      'Funding_Case_Agreement_Commitment.id',
      'Funding_Case_Agreement_Payment.egcs_fc_fundingagreementcommitment'
    )
    .innerJoin('Transfer_Payment_Stream_Commitment_Type', 'Transfer_Payment_Stream_Commitment_Type.id', 'Funding_Case_Agreement_Commitment.egcs_fc_type')
    .innerJoin('Agency_Commitment_Type', 'Agency_Commitment_Type.id', 'Transfer_Payment_Stream_Commitment_Type.egcs_tp_agencycommitmenttype')
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year', join => join.on(
      budgetFiscalYearStableId, '=', sql.ref('Funding_Case_Agreement_Payment.egcs_fc_fiscalyear')
    ))
    .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
    .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
    .leftJoin('Funding_Case_Agreement_Payment_Line', join => join
      .onRef('Funding_Case_Agreement_Payment_Line.egcs_fc_fundingagreementpayment', '=', 'Funding_Case_Agreement_Payment.id')
      .on('Funding_Case_Agreement_Payment_Line._deleted', '=', false))
    .select([
      'Funding_Case_Agreement_Payment.id as id',
      sql<string | null>`COALESCE(${sql.ref('payee.egcs_ar_operatingname_en')}, ${sql.ref('payee.egcs_ar_legalname_en')})`.as('egcs_fc_payeename_en'),
      sql<string | null>`COALESCE(${sql.ref('payee.egcs_ar_operatingname_fr')}, ${sql.ref('payee.egcs_ar_legalname_fr')})`.as('egcs_fc_payeename_fr'),
      'Funding_Case_Agreement_Payment.egcs_fc_fundingagreementcommitment as egcs_fc_fundingagreementcommitment',
      'Funding_Case_Agreement_Payment.egcs_fc_fiscalyear as egcs_fc_fiscalyear',
      'Funding_Case_Agreement_Payment.egcs_fc_paymenttype as egcs_fc_paymenttype',
      'Funding_Case_Agreement_Payment.egcs_fc_applicantrecipient as egcs_fc_applicantrecipient',
      'Funding_Case_Agreement_Payment.egcs_fc_periodstart as egcs_fc_periodstart',
      'Funding_Case_Agreement_Payment.egcs_fc_periodend as egcs_fc_periodend',
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Payment.egcs_fc_paymentamount')).as('egcs_fc_paymentamount'),
      'Funding_Case_Agreement_Payment.egcs_fc_currency as egcs_fc_currency',
      'Funding_Case_Agreement_Payment.egcs_fc_comment as egcs_fc_comment',
      'Funding_Case_Agreement_Payment.egcs_fc_status as egcs_fc_status',
      'Funding_Case_Agreement_Commitment.egcs_fc_type as commitment_type',
      'Agency_Commitment_Type.egcs_ay_name_en as commitment_type_name_en',
      'Agency_Commitment_Type.egcs_ay_name_fr as commitment_type_name_fr',
      'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display',
      sql<number>`COUNT(${sql.ref('Funding_Case_Agreement_Payment_Line.id')})`.as('line_count'),
      databaseMoneyText(sql`COALESCE(SUM(${sql.ref('Funding_Case_Agreement_Payment_Line.egcs_fc_amount')}), 0)`).as('line_total')
    ])
    .where('Funding_Case_Agreement_Commitment.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Payment._deleted', '=', false)
    .where('Funding_Case_Agreement_Commitment._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .where('Agency_Fiscal_Year._deleted', '=', false)
    .groupBy([
      'Funding_Case_Agreement_Payment.id',
      'payee.id',
      'Funding_Case_Agreement_Commitment.egcs_fc_type',
      'Agency_Commitment_Type.egcs_ay_name_en',
      'Agency_Commitment_Type.egcs_ay_name_fr',
      'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay'
    ])
    .orderBy('Funding_Case_Agreement_Payment.id', 'asc')
    .execute()

  const exactPayments = payments.map(payment => ({
    ...payment,
    egcs_fc_paymentamount: parseDatabaseMoney(payment.egcs_fc_paymentamount),
    line_total: parseDatabaseMoney(payment.line_total)
  }))
  const paymentsWithState = await withBusinessRecordState(db, 'fundingcasepayment', exactPayments)
  const withRecovery = await Promise.all(paymentsWithState.map(async payment => ({ ...payment, ...await readAccountReceivablePaymentOffset(db, String(payment.id), { liveMemoBalances }) })))
  return { payments: withRecovery }
})
