import { badRequest } from '~~/server/utils/api-errors'
import { executeAgreementMonitorMutation, prepareAgreementMonitorRoute } from '~~/server/utils/agreement-monitor'

export default defineEventHandler(async event => {
  const monitorId = getRouterParam(event, 'monitorId')
  if (!monitorId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const prepared = await prepareAgreementMonitorRoute(event, 'delete', {
    entityType: 'fundingcasemonitor',
    entityId: monitorId
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared

  await executeAgreementMonitorMutation(event, db, agreementId, agreementContext, monitorId, async trx => {
    const deleted = await trx
      .updateTable('Funding_Case_Agreement_Monitor')
      .set({ _deleted: true })
      .where('id', '=', monitorId)
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .returning('id')
      .executeTakeFirst()
    if (!deleted) {
      return await badRequest(event, 'AGREEMENT_MONITOR_NOT_FOUND', 'apiErrors.agreement.monitor_not_found')
    }

    await trx.updateTable('Funding_Case_Agreement_Monitor_Planning').set({ _deleted: true }).where('egcs_fc_fundingagreementmonitor', '=', monitorId).where('_deleted', '=', false).execute()
    await trx.updateTable('Funding_Case_Agreement_Monitor_Items').set({ _deleted: true }).where('egcs_fc_fundingagreementmonitor', '=', monitorId).where('_deleted', '=', false).execute()
    await trx.updateTable('Funding_Case_Agreement_Monitor_Finding').set({ _deleted: true }).where('egcs_fc_fundingagreementmonitor', '=', monitorId).where('_deleted', '=', false).execute()
    await trx.updateTable('Funding_Case_Agreement_Monitor_Promising_Practice').set({ _deleted: true }).where('egcs_fc_fundingagreementmonitor', '=', monitorId).where('_deleted', '=', false).execute()

    const followups = await trx.selectFrom('Funding_Case_Agreement_Monitor_Followup').where('egcs_fc_fundingagreementmonitor', '=', monitorId).where('_deleted', '=', false).select('id').execute()
    const followupIds = followups.map(followup => String(followup.id))

    if (followupIds.length > 0) {
      await trx.updateTable('Funding_Case_Agreement_Monitor_Followup_Update').set({ _deleted: true }).where('egcs_fc_fundingagreementmonitorfollowup', 'in', followupIds).where('_deleted', '=', false).execute()
      await trx.updateTable('Funding_Case_Agreement_Monitor_Followup').set({ _deleted: true }).where('id', 'in', followupIds).where('_deleted', '=', false).execute()
    }
  }, { action: 'delete' })

  return { success: true }
})
