import { sql } from 'kysely'
import {
  AGREEMENT_CHILD_ERROR_KEYS,
  assertAgreementChildExists
} from '~~/server/utils/agreement-child-resources'
import { prepareAgreementCommitmentRoute } from '~~/server/utils/agreement-commitment'
import { badRequest } from '~~/server/utils/api-errors'
import { withBusinessRecordState } from '~~/server/utils/business-record-state'
import { getAgreementCommitmentLineBalances } from '~~/server/utils/agreement-commitment-line-balances'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'

export default defineEventHandler(async event => {
  const childId = getRouterParam(event, 'childId')
  if (!childId || !isPositivePostgresBigintText(childId)) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  return await executeFreshReadSnapshot(event, async () => {
    const prepared = await prepareAgreementCommitmentRoute(event, 'read', {
      entityType: 'fundingcaseagreementcommitment',
      entityId: childId
    })
    if (!prepared || !('agreementId' in prepared)) {
      return prepared
    }

    const { agreementId, db } = prepared

    const commitment = await assertAgreementChildExists(
      event,
      db
        .selectFrom('Funding_Case_Agreement_Commitment')
        .innerJoin(
          'Funding_Case_Agreement_Profile',
          'Funding_Case_Agreement_Profile.id',
          'Funding_Case_Agreement_Commitment.egcs_fc_fundingagreement'
        )
        .innerJoin(
          'Transfer_Payment_Stream',
          'Transfer_Payment_Stream.id',
          'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream'
        )
        .innerJoin('Transfer_Payment_Stream_Commitment_Type', 'Transfer_Payment_Stream_Commitment_Type.id', 'Funding_Case_Agreement_Commitment.egcs_fc_type')
        .innerJoin('Agency_Commitment_Type', 'Agency_Commitment_Type.id', 'Transfer_Payment_Stream_Commitment_Type.egcs_tp_agencycommitmenttype')
        .where('Funding_Case_Agreement_Commitment.id', '=', childId)
        .where('Funding_Case_Agreement_Commitment.egcs_fc_fundingagreement', '=', agreementId)
        .where('Funding_Case_Agreement_Commitment._deleted', '=', false)
        .where('Funding_Case_Agreement_Profile._deleted', '=', false)
        .where('Transfer_Payment_Stream._deleted', '=', false)
        .select([
          'Funding_Case_Agreement_Commitment.id as id',
          'Funding_Case_Agreement_Commitment.egcs_fc_fundingagreement as egcs_fc_fundingagreement',
          'Funding_Case_Agreement_Commitment.egcs_fc_type as egcs_fc_type',
          'Funding_Case_Agreement_Commitment.egcs_fc_currency as egcs_fc_currency',
          databaseMoneyText(sql.ref('Funding_Case_Agreement_Commitment.egcs_fc_totalamount')).as('egcs_fc_totalamount'),
          'Funding_Case_Agreement_Commitment.egcs_fc_status as egcs_fc_status',
          'Funding_Case_Agreement_Commitment.egcs_fc_active as egcs_fc_active',
          'Funding_Case_Agreement_Commitment.egcs_fc_financialsystemnumber as egcs_fc_financialsystemnumber',
          'Agency_Commitment_Type.egcs_ay_name_en as commitment_type_name_en',
          'Agency_Commitment_Type.egcs_ay_name_fr as commitment_type_name_fr',
          'Funding_Case_Agreement_Profile.egcs_fc_title_en as agreement_title_en',
          'Funding_Case_Agreement_Profile.egcs_fc_title_fr as agreement_title_fr',
          'Funding_Case_Agreement_Profile.egcs_fc_agreementnumber as agreement_number',
          'Funding_Case_Agreement_Profile.egcs_fc_financialsystemnumber as agreement_financial_system_number',
          'Transfer_Payment_Stream.egcs_tp_name_en as stream_name_en',
          'Transfer_Payment_Stream.egcs_tp_name_fr as stream_name_fr'
        ])
        .executeTakeFirst(),
      ...AGREEMENT_CHILD_ERROR_KEYS.commitmentNotFound
    )
    if (!commitment || typeof commitment !== 'object' || !('id' in commitment)) {
      return commitment
    }

    const lines = await getAgreementCommitmentLineBalances(db, agreementId, childId)

    const [commitmentWithState] = await withBusinessRecordState(db, 'fundingcaseagreementcommitment', [commitment])

    return {
      ...commitmentWithState,
      egcs_fc_totalamount: parseDatabaseMoney(commitment.egcs_fc_totalamount),
      lines
    }
  })
})
