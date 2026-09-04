import { badRequest } from '~~/server/utils/api-errors'
import { executeAgreementMonitorMutation, prepareAgreementMonitorRoute } from '~~/server/utils/agreement-monitor'

export default defineEventHandler(async event => {
  const childId = getRouterParam(event, 'childId')
  if (!childId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const existing = await event.context.$db.selectFrom('Funding_Case_Agreement_Monitor_Followup').where('id', '=', childId).where('_deleted', '=', false).selectAll().executeTakeFirst()
  if (!existing) return await badRequest(event, 'AGREEMENT_MONITOR_FOLLOWUP_NOT_FOUND', 'apiErrors.agreement.monitor_followup_not_found')
  const monitorId = String(existing.egcs_fc_fundingagreementmonitor)
  const prepared = await prepareAgreementMonitorRoute(event, 'delete', { entityType: 'fundingcasemonitor', entityId: monitorId })
  if (!prepared || !('agreementId' in prepared)) return prepared
  const { agreementId, agreementContext, db } = prepared
  await executeAgreementMonitorMutation(event, db, agreementId, agreementContext, monitorId, async trx => {
    await trx.updateTable('Funding_Case_Agreement_Monitor_Followup_Update').set({ _deleted: true }).where('egcs_fc_fundingagreementmonitorfollowup', '=', childId).where('_deleted', '=', false).execute()
    await trx.updateTable('Funding_Case_Agreement_Monitor_Followup').set({ _deleted: true }).where('id', '=', childId).where('egcs_fc_fundingagreementmonitor', '=', monitorId).where('_deleted', '=', false).execute()
  }, { action: 'delete' })
  return { success: true }
})
