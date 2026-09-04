import { badRequest } from '~~/server/utils/api-errors'
import { assertAgreementMonitorExists, prepareAgreementMonitorRoute } from '~~/server/utils/agreement-monitor'
import { withBusinessRecordState } from '~~/server/utils/business-record-state'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

const readRoute = defineEventHandler(async event => {
  const monitorId = getRouterParam(event, 'monitorId')
  if (!monitorId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const prepared = await prepareAgreementMonitorRoute(event, 'read', {
    entityType: 'fundingcasemonitor',
    entityId: monitorId
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, db } = prepared
  const monitorExists = await assertAgreementMonitorExists(event, db, agreementId, monitorId)
  if (!monitorExists || !('id' in monitorExists)) {
    return monitorExists
  }

  const [monitor, planning, items, findings, followups, followupUpdates, promisingPractices] = await Promise.all([
    db
      .selectFrom('Funding_Case_Agreement_Monitor')
      .innerJoin('Funding_Case_Agreement_Profile', 'Funding_Case_Agreement_Profile.id', 'Funding_Case_Agreement_Monitor.egcs_fc_fundingagreement')
      .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream')
      .innerJoin('Transfer_Payment_Monitor_Type', 'Transfer_Payment_Monitor_Type.id', 'Funding_Case_Agreement_Monitor.egcs_fc_type')
      .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Monitor.egcs_fc_tentativefiscalyear')
      .where('Funding_Case_Agreement_Monitor.id', '=', monitorId)
      .where('Funding_Case_Agreement_Monitor.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Monitor._deleted', '=', false)
      .select([
        'Funding_Case_Agreement_Monitor.id as id',
        'Funding_Case_Agreement_Monitor.egcs_fc_fundingagreement as egcs_fc_fundingagreement',
        'Funding_Case_Agreement_Monitor.egcs_fc_type as egcs_fc_type',
        'Funding_Case_Agreement_Monitor.egcs_fc_onsite as egcs_fc_onsite',
        'Funding_Case_Agreement_Monitor.egcs_fc_tentativefiscalyear as egcs_fc_tentativefiscalyear',
        'Funding_Case_Agreement_Monitor.egcs_fc_tentativequarter as egcs_fc_tentativequarter',
        'Funding_Case_Agreement_Monitor.egcs_fc_status as egcs_fc_status',
        'Funding_Case_Agreement_Profile.egcs_fc_title_en as agreement_title_en',
        'Funding_Case_Agreement_Profile.egcs_fc_title_fr as agreement_title_fr',
        'Funding_Case_Agreement_Profile.egcs_fc_agreementnumber as agreement_number',
        'Funding_Case_Agreement_Profile.egcs_fc_financialsystemnumber as agreement_financial_system_number',
        'Transfer_Payment_Stream.egcs_tp_name_en as stream_name_en',
        'Transfer_Payment_Stream.egcs_tp_name_fr as stream_name_fr',
        'Transfer_Payment_Monitor_Type.egcs_tp_name_en as monitor_type_name_en',
        'Transfer_Payment_Monitor_Type.egcs_tp_name_fr as monitor_type_name_fr',
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display'
      ])
      .executeTakeFirst(),
    db.selectFrom('Funding_Case_Agreement_Monitor_Planning').where('egcs_fc_fundingagreementmonitor', '=', monitorId).where('_deleted', '=', false).selectAll().orderBy('id', 'asc').execute(),
    db.selectFrom('Funding_Case_Agreement_Monitor_Items').where('egcs_fc_fundingagreementmonitor', '=', monitorId).where('_deleted', '=', false).selectAll().orderBy('id', 'asc').execute(),
    db.selectFrom('Funding_Case_Agreement_Monitor_Finding').where('egcs_fc_fundingagreementmonitor', '=', monitorId).where('_deleted', '=', false).selectAll().orderBy('id', 'asc').execute(),
    db.selectFrom('Funding_Case_Agreement_Monitor_Followup').where('egcs_fc_fundingagreementmonitor', '=', monitorId).where('_deleted', '=', false).selectAll().orderBy('id', 'asc').execute(),
    db.selectFrom('Funding_Case_Agreement_Monitor_Followup_Update')
      .innerJoin('Funding_Case_Agreement_Monitor_Followup', 'Funding_Case_Agreement_Monitor_Followup.id', 'Funding_Case_Agreement_Monitor_Followup_Update.egcs_fc_fundingagreementmonitorfollowup')
      .where('Funding_Case_Agreement_Monitor_Followup.egcs_fc_fundingagreementmonitor', '=', monitorId)
      .where('Funding_Case_Agreement_Monitor_Followup_Update._deleted', '=', false)
      .where('Funding_Case_Agreement_Monitor_Followup._deleted', '=', false)
      .select([
        'Funding_Case_Agreement_Monitor_Followup_Update.id as id',
        'Funding_Case_Agreement_Monitor_Followup_Update.egcs_fc_fundingagreementmonitorfollowup as egcs_fc_fundingagreementmonitorfollowup',
        'Funding_Case_Agreement_Monitor_Followup_Update.egcs_fc_update as egcs_fc_update',
        'Funding_Case_Agreement_Monitor_Followup_Update.egcs_fc_status as egcs_fc_status',
        'Funding_Case_Agreement_Monitor_Followup_Update.egcs_fc_updatedate as egcs_fc_updatedate'
      ])
      .orderBy('Funding_Case_Agreement_Monitor_Followup_Update.id', 'asc')
      .execute(),
    db.selectFrom('Funding_Case_Agreement_Monitor_Promising_Practice').where('egcs_fc_fundingagreementmonitor', '=', monitorId).where('_deleted', '=', false).selectAll().orderBy('id', 'asc').execute()
  ])

  if (!monitor) {
    return await badRequest(event, 'AGREEMENT_MONITOR_NOT_FOUND', 'apiErrors.agreement.monitor_not_found')
  }

  const [monitorWithState] = await withBusinessRecordState(db, 'fundingcasemonitor', [monitor])

  return {
    ...monitorWithState,
    planning,
    items,
    findings,
    followups,
    followupUpdates,
    promisingPractices
  }
})

export default defineEventHandler(async event =>
  await executeFreshReadSnapshot(event, async () => await readRoute(event)))
