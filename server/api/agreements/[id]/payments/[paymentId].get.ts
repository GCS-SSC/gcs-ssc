import { sql } from 'kysely'
import { prepareAgreementPaymentRoute } from '~~/server/utils/agreement-payment'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { budgetFiscalYearStableId } from '~~/server/utils/agreement-budget-lineage'
import { withBusinessRecordState } from '~~/server/utils/business-record-state'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'

export default defineEventHandler(async event => {
  const paymentId = getRouterParam(event, 'paymentId')
  if (!paymentId || !isPositivePostgresBigintText(paymentId)) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const prepared = await prepareAgreementPaymentRoute(event, 'read', {
    entityType: 'fundingcasepayment',
    entityId: paymentId
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, db } = prepared
  const payment = await db
    .selectFrom('Funding_Case_Agreement_Payment')
    .innerJoin(
      'Funding_Case_Agreement_Commitment',
      'Funding_Case_Agreement_Commitment.id',
      'Funding_Case_Agreement_Payment.egcs_fc_fundingagreementcommitment'
    )
    .innerJoin(
      'Funding_Case_Agreement_Profile',
      'Funding_Case_Agreement_Profile.id',
      'Funding_Case_Agreement_Commitment.egcs_fc_fundingagreement'
    )
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year', join => join.on(
      budgetFiscalYearStableId, '=', sql.ref('Funding_Case_Agreement_Payment.egcs_fc_fiscalyear')
    ))
    .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
    .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
    .innerJoin(
      'Transfer_Payment_Stream',
      'Transfer_Payment_Stream.id',
      'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream'
    )
    .where('Funding_Case_Agreement_Payment.id', '=', paymentId)
    .where('Funding_Case_Agreement_Commitment.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Payment._deleted', '=', false)
    .where('Funding_Case_Agreement_Commitment._deleted', '=', false)
    .where('Funding_Case_Agreement_Profile._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .where('Agency_Fiscal_Year._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .select([
      'Funding_Case_Agreement_Payment.id as id',
      'Funding_Case_Agreement_Payment.egcs_fc_fundingagreementcommitment as egcs_fc_fundingagreementcommitment',
      'Funding_Case_Agreement_Payment.egcs_fc_fiscalyear as egcs_fc_fiscalyear',
      'Funding_Case_Agreement_Payment.egcs_fc_paymenttype as egcs_fc_paymenttype',
      'Funding_Case_Agreement_Payment.egcs_fc_periodstart as egcs_fc_periodstart',
      'Funding_Case_Agreement_Payment.egcs_fc_periodend as egcs_fc_periodend',
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Payment.egcs_fc_paymentamount')).as('egcs_fc_paymentamount'),
      'Funding_Case_Agreement_Payment.egcs_fc_currency as egcs_fc_currency',
      'Funding_Case_Agreement_Payment.egcs_fc_comment as egcs_fc_comment',
      'Funding_Case_Agreement_Payment.egcs_fc_status as egcs_fc_status',
      'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display',
      'Funding_Case_Agreement_Commitment.egcs_fc_fundingagreement as agreement_id',
      'Funding_Case_Agreement_Profile.egcs_fc_title_en as agreement_title_en',
      'Funding_Case_Agreement_Profile.egcs_fc_title_fr as agreement_title_fr',
      'Funding_Case_Agreement_Profile.egcs_fc_agreementnumber as agreement_number',
      'Funding_Case_Agreement_Profile.egcs_fc_financialsystemnumber as agreement_financial_system_number',
      'Transfer_Payment_Stream.egcs_tp_name_en as stream_name_en',
      'Transfer_Payment_Stream.egcs_tp_name_fr as stream_name_fr'
    ])
    .executeTakeFirst()
  if (!payment) {
    return await notFound(event, 'AGREEMENT_PAYMENT_NOT_FOUND', 'apiErrors.agreement.payment_not_found')
  }

  const lines = await db
    .selectFrom('Funding_Case_Agreement_Payment_Line')
    .innerJoin(
      'Funding_Case_Agreement_Commitment_Line',
      'Funding_Case_Agreement_Commitment_Line.id',
      'Funding_Case_Agreement_Payment_Line.egcs_fc_fundingagreementcommitmentline'
    )
    .innerJoin(
      'Transfer_Payment_Stream_Chart_of_Account',
      'Transfer_Payment_Stream_Chart_of_Account.id',
      'Funding_Case_Agreement_Commitment_Line.egcs_fc_transferpaymentstreamchartofaccount'
    )
    .innerJoin(
      'Transfer_Payment_Stream_Budget',
      'Transfer_Payment_Stream_Budget.id',
      'Transfer_Payment_Stream_Chart_of_Account.egcs_tp_streambudget'
    )
    .innerJoin(
      'Transfer_Payment_Fiscal_Year_Budget',
      'Transfer_Payment_Fiscal_Year_Budget.id',
      'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget'
    )
    .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear')
    .where('Funding_Case_Agreement_Payment_Line.egcs_fc_fundingagreementpayment', '=', paymentId)
    .where('Funding_Case_Agreement_Payment_Line._deleted', '=', false)
    .where('Funding_Case_Agreement_Commitment_Line._deleted', '=', false)
    .where('Transfer_Payment_Stream_Chart_of_Account._deleted', '=', false)
    .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
    .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
    .where('Agency_Fiscal_Year._deleted', '=', false)
    .select([
      'Funding_Case_Agreement_Payment_Line.id as id',
      'Funding_Case_Agreement_Payment_Line.egcs_fc_fundingagreementpayment as egcs_fc_fundingagreementpayment',
      'Funding_Case_Agreement_Payment_Line.egcs_fc_fundingagreementcommitmentline as egcs_fc_fundingagreementcommitmentline',
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Payment_Line.egcs_fc_amount')).as('egcs_fc_amount'),
      'Funding_Case_Agreement_Commitment_Line.egcs_fc_commitmentlinenumber as commitment_line_number',
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Commitment_Line.egcs_fc_amount')).as('commitment_line_amount'),
      'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display',
      'Transfer_Payment_Stream_Chart_of_Account.egcs_tp_accountingdimensions as accounting_dimensions'
    ])
    .orderBy('Funding_Case_Agreement_Commitment_Line.egcs_fc_commitmentlinenumber', 'asc')
    .execute()

  const [paymentWithState] = await withBusinessRecordState(db, 'fundingcasepayment', [{
    ...payment,
    egcs_fc_paymentamount: parseDatabaseMoney(payment.egcs_fc_paymentamount)
  }])

  return {
    ...paymentWithState,
    lines: lines.map(line => ({
      ...line,
      egcs_fc_amount: parseDatabaseMoney(line.egcs_fc_amount),
      commitment_line_amount: parseDatabaseMoney(line.commitment_line_amount)
    }))
  }
})
