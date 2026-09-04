import { badRequest } from '~~/server/utils/api-errors'
import {
  executeAgreementMonitorMutation,
  prepareAgreementMonitorRoute,
  syncAgreementMonitorFollowupStatus
} from '~~/server/utils/agreement-monitor'
import { requireAuthContext } from '~~/server/utils/authorize'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const childId = getRouterParam(event, 'childId')
  if (!childId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(childId)) return await badRequest(event, 'AGREEMENT_MONITOR_FOLLOWUP_UPDATE_NOT_FOUND', 'apiErrors.agreement.monitor_followup_update_not_found')
  await requireAuthContext(event)
  const existing = await event.context.$db.selectFrom('Funding_Case_Agreement_Monitor_Followup_Update').where('id', '=', childId).where('_deleted', '=', false).selectAll().executeTakeFirst()
  if (!existing) return await badRequest(event, 'AGREEMENT_MONITOR_FOLLOWUP_UPDATE_NOT_FOUND', 'apiErrors.agreement.monitor_followup_update_not_found')
  const followup = await event.context.$db.selectFrom('Funding_Case_Agreement_Monitor_Followup').where('id', '=', String(existing.egcs_fc_fundingagreementmonitorfollowup)).where('_deleted', '=', false).selectAll().executeTakeFirst()
  if (!followup) return await badRequest(event, 'AGREEMENT_MONITOR_FOLLOWUP_NOT_FOUND', 'apiErrors.agreement.monitor_followup_not_found')
  const monitorId = String(followup.egcs_fc_fundingagreementmonitor)
  const prepared = await prepareAgreementMonitorRoute(event, 'delete', { entityType: 'fundingcasemonitor', entityId: monitorId })
  if (!prepared || !('agreementId' in prepared)) return prepared
  const { agreementId, agreementContext, db } = prepared
  const followupId = String(existing.egcs_fc_fundingagreementmonitorfollowup)
  await executeAgreementMonitorMutation(event, db, agreementId, agreementContext, monitorId, async trx => {
    const deleted = await trx.updateTable('Funding_Case_Agreement_Monitor_Followup_Update').set({ _deleted: true }).where('id', '=', childId).where('egcs_fc_fundingagreementmonitorfollowup', '=', followupId).where('_deleted', '=', false).returning('id').executeTakeFirst()
    if (!deleted) return await badRequest(event, 'AGREEMENT_MONITOR_FOLLOWUP_UPDATE_NOT_FOUND', 'apiErrors.agreement.monitor_followup_update_not_found')
    await syncAgreementMonitorFollowupStatus(trx, followupId)
  }, { action: 'delete' })
  return { success: true }
})
