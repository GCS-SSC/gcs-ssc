import { sql } from 'kysely'
import { prepareAgreementCommitmentRoute } from '~~/server/utils/agreement-commitment'
import { withBusinessRecordState } from '~~/server/utils/business-record-state'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

export default defineEventHandler(async event => {
  return await executeFreshReadSnapshot(event, async snapshotDb => {
    const prepared = await prepareAgreementCommitmentRoute(event, 'read', undefined, { db: snapshotDb, freshAuth: true })
    if (!prepared || !('agreementId' in prepared)) {
      return prepared
    }

    const { agreementId, db } = prepared

    const [commitments, lines] = await Promise.all([
      db
        .selectFrom('Funding_Case_Agreement_Commitment')
        .innerJoin('Transfer_Payment_Stream_Commitment_Type', 'Transfer_Payment_Stream_Commitment_Type.id', 'Funding_Case_Agreement_Commitment.egcs_fc_type')
        .where('egcs_fc_fundingagreement', '=', agreementId)
        .where('Funding_Case_Agreement_Commitment._deleted', '=', false)
        .where('Transfer_Payment_Stream_Commitment_Type._deleted', '=', false)
        .select([
          'Funding_Case_Agreement_Commitment.id as id',
          'Funding_Case_Agreement_Commitment.egcs_fc_fundingagreement as egcs_fc_fundingagreement',
          'Funding_Case_Agreement_Commitment.egcs_fc_type as egcs_fc_type',
          'Funding_Case_Agreement_Commitment.egcs_fc_status as egcs_fc_status',
          'Funding_Case_Agreement_Commitment.egcs_fc_active as egcs_fc_active',
          'Funding_Case_Agreement_Commitment.egcs_fc_financialsystemnumber as egcs_fc_financialsystemnumber',
          'Transfer_Payment_Stream_Commitment_Type.egcs_tp_name_en as commitment_type_name_en',
          'Transfer_Payment_Stream_Commitment_Type.egcs_tp_name_fr as commitment_type_name_fr'
        ])
        .orderBy('Funding_Case_Agreement_Commitment.id', 'asc')
        .execute(),
      db
        .selectFrom('Funding_Case_Agreement_Commitment_Line')
        .innerJoin(
          'Funding_Case_Agreement_Commitment',
          'Funding_Case_Agreement_Commitment.id',
          'Funding_Case_Agreement_Commitment_Line.egcs_fc_commitment'
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
        .where('Funding_Case_Agreement_Commitment.egcs_fc_fundingagreement', '=', agreementId)
        .where('Funding_Case_Agreement_Commitment_Line._deleted', '=', false)
        .where('Funding_Case_Agreement_Commitment._deleted', '=', false)
        .where('Transfer_Payment_Stream_Chart_of_Account._deleted', '=', false)
        .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
        .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
        .where('Agency_Fiscal_Year._deleted', '=', false)
        .select([
          'Funding_Case_Agreement_Commitment_Line.id as id',
          'Funding_Case_Agreement_Commitment_Line.egcs_fc_commitment as egcs_fc_commitment',
          'Funding_Case_Agreement_Commitment_Line.egcs_fc_commitmentlinenumber as egcs_fc_commitmentlinenumber',
          'Funding_Case_Agreement_Commitment_Line.egcs_fc_transferpaymentstreamchartofaccount as egcs_fc_transferpaymentstreamchartofaccount',
          databaseMoneyText(sql.ref('Funding_Case_Agreement_Commitment_Line.egcs_fc_amount')).as('egcs_fc_amount'),
          'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display',
          'Transfer_Payment_Stream_Chart_of_Account.egcs_tp_accountingdimensions as accounting_dimensions'
        ])
        .orderBy('Funding_Case_Agreement_Commitment.id', 'asc')
        .orderBy('Funding_Case_Agreement_Commitment_Line.egcs_fc_commitmentlinenumber', 'asc')
        .orderBy(sql`LOWER("Transfer_Payment_Stream_Chart_of_Account"."egcs_tp_accountingdimensions"->0->>'value')`, 'asc')
        .orderBy('Transfer_Payment_Stream_Chart_of_Account.id', 'asc')
        .execute()
    ])

    const commitmentsWithState = await withBusinessRecordState(db, 'fundingcaseagreementcommitment', commitments)
    return {
      commitments: commitmentsWithState,
      lines: lines.map(line => ({ ...line, egcs_fc_amount: parseDatabaseMoney(line.egcs_fc_amount) }))
    }
  })
})
