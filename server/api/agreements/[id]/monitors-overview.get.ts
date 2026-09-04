import { prepareAgreementMonitorRoute } from '~~/server/utils/agreement-monitor'
import { withBusinessRecordState } from '~~/server/utils/business-record-state'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

const readRoute = defineEventHandler(async event => {
  const prepared = await prepareAgreementMonitorRoute(event, 'read')
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, db } = prepared

  const monitors = await db
    .selectFrom('Funding_Case_Agreement_Monitor')
    .innerJoin('Transfer_Payment_Monitor_Type', 'Transfer_Payment_Monitor_Type.id', 'Funding_Case_Agreement_Monitor.egcs_fc_type')
    .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Monitor.egcs_fc_tentativefiscalyear')
    .where('Funding_Case_Agreement_Monitor.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Monitor._deleted', '=', false)
    .where('Transfer_Payment_Monitor_Type._deleted', '=', false)
    .where('Agency_Fiscal_Year._deleted', '=', false)
    .select([
      'Funding_Case_Agreement_Monitor.id as id',
      'Funding_Case_Agreement_Monitor.egcs_fc_fundingagreement as egcs_fc_fundingagreement',
      'Funding_Case_Agreement_Monitor.egcs_fc_type as egcs_fc_type',
      'Funding_Case_Agreement_Monitor.egcs_fc_onsite as egcs_fc_onsite',
      'Funding_Case_Agreement_Monitor.egcs_fc_tentativefiscalyear as egcs_fc_tentativefiscalyear',
      'Funding_Case_Agreement_Monitor.egcs_fc_tentativequarter as egcs_fc_tentativequarter',
      'Funding_Case_Agreement_Monitor.egcs_fc_status as egcs_fc_status',
      'Transfer_Payment_Monitor_Type.egcs_tp_name_en as monitor_type_name_en',
      'Transfer_Payment_Monitor_Type.egcs_tp_name_fr as monitor_type_name_fr',
      'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display'
    ])
    .orderBy('Funding_Case_Agreement_Monitor.id', 'asc')
    .execute()

  const monitorsWithState = await withBusinessRecordState(db, 'fundingcasemonitor', monitors)
  return { monitors: monitorsWithState }
})

export default defineEventHandler(async event =>
  await executeFreshReadSnapshot(event, async () => await readRoute(event)))
