import { resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { authorize } from '~~/server/utils/authorize'
import { defineEventHandler, getRouterParam } from 'h3'
import { badRequest } from '~~/server/utils/api-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { executeAgreementMonitorMutation, prepareAgreementMonitorRoute } from '~~/server/utils/agreement-monitor'

export default defineEventHandler(async event => {
  // Check the owning role before child existence; exact Monitor assignment follows.
  await authorize(event, 'agreement', 'delete', async () => ({
    scope: (await resolveAgreementScopeContext(getRouterParam(event, 'id') ?? '', event.context.$db))?.scope
      ?? { type: 'global' as const }
  }))
  const routeAgreementId = getRouterParam(event, 'id') ?? ''
  if (!isPositivePostgresBigintText(routeAgreementId)) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const childId = getRouterParam(event, 'childId')
  if (!childId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(childId)) return await badRequest(event, 'AGREEMENT_MONITOR_FOLLOWUP_NOT_FOUND', 'apiErrors.agreement.monitor_followup_not_found')
  const existing = await event.context.$db.selectFrom('Funding_Case_Agreement_Monitor_Followup')
    .innerJoin('Funding_Case_Agreement_Monitor as owner_monitor', 'owner_monitor.id', 'Funding_Case_Agreement_Monitor_Followup.egcs_fc_fundingagreementmonitor')
    .where('owner_monitor.egcs_fc_fundingagreement', '=', routeAgreementId)
    .where('owner_monitor._deleted', '=', false)
    .where('Funding_Case_Agreement_Monitor_Followup.id', '=', childId)
    .where('Funding_Case_Agreement_Monitor_Followup._deleted', '=', false)
    .selectAll('Funding_Case_Agreement_Monitor_Followup').executeTakeFirst()
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
