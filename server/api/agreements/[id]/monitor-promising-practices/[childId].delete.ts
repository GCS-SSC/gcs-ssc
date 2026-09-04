import { badRequest } from '~~/server/utils/api-errors'
import { executeAgreementMonitorMutation, prepareAgreementMonitorRoute } from '~~/server/utils/agreement-monitor'
import { requireAuthContext } from '~~/server/utils/authorize'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const childId = getRouterParam(event, 'childId')
  if (!childId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(childId)) return await badRequest(event, 'AGREEMENT_MONITOR_PROMISING_PRACTICE_NOT_FOUND', 'apiErrors.agreement.monitor_promising_practice_not_found')
  await requireAuthContext(event)
  const existing = await event.context.$db.selectFrom('Funding_Case_Agreement_Monitor_Promising_Practice').where('id', '=', childId).where('_deleted', '=', false).selectAll().executeTakeFirst()
  if (!existing) return await badRequest(event, 'AGREEMENT_MONITOR_PROMISING_PRACTICE_NOT_FOUND', 'apiErrors.agreement.monitor_promising_practice_not_found')
  const monitorId = String(existing.egcs_fc_fundingagreementmonitor)
  const prepared = await prepareAgreementMonitorRoute(event, 'delete', { entityType: 'fundingcasemonitor', entityId: monitorId })
  if (!prepared || !('agreementId' in prepared)) return prepared
  const { agreementId, agreementContext, db } = prepared
  await executeAgreementMonitorMutation(event, db, agreementId, agreementContext, monitorId, async trx => {
    const deleted = await trx.updateTable('Funding_Case_Agreement_Monitor_Promising_Practice').set({ _deleted: true }).where('id', '=', childId).where('egcs_fc_fundingagreementmonitor', '=', monitorId).where('_deleted', '=', false).returning('id').executeTakeFirst()
    if (!deleted) return await badRequest(event, 'AGREEMENT_MONITOR_PROMISING_PRACTICE_NOT_FOUND', 'apiErrors.agreement.monitor_promising_practice_not_found')
  }, { action: 'delete' })
  return { success: true }
})
