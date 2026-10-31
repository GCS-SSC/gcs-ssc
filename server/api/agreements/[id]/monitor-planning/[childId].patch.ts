import { resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { authorize } from '~~/server/utils/authorize'
import { defineEventHandler, getRouterParam } from 'h3'
import { readAgreementMonitorBody } from '~~/server/utils/agreement-monitor-validation'
import { FundingCaseAgreementMonitorPlanningPatchSchema } from '~~/shared/types/schemas'
import { badRequest } from '~~/server/utils/api-errors'
import { executeAgreementMonitorMutation, prepareAgreementMonitorRoute } from '~~/server/utils/agreement-monitor'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  // Check the owning role before child existence; exact Monitor assignment follows.
  await authorize(event, 'agreement', 'update', async () => ({
    scope: (await resolveAgreementScopeContext(getRouterParam(event, 'id') ?? '', event.context.$db))?.scope
      ?? { type: 'global' as const }
  }))
  const routeAgreementId = getRouterParam(event, 'id') ?? ''
  if (!isPositivePostgresBigintText(routeAgreementId)) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const childId = getRouterParam(event, 'childId')
  if (!childId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(childId)) return await badRequest(event, 'AGREEMENT_MONITOR_PLANNING_NOT_FOUND', 'apiErrors.agreement.monitor_planning_not_found')
  const existing = await event.context.$db.selectFrom('Funding_Case_Agreement_Monitor_Planning')
    .innerJoin('Funding_Case_Agreement_Monitor as owner_monitor', 'owner_monitor.id', 'Funding_Case_Agreement_Monitor_Planning.egcs_fc_fundingagreementmonitor')
    .where('owner_monitor.egcs_fc_fundingagreement', '=', routeAgreementId)
    .where('owner_monitor._deleted', '=', false)
    .where('Funding_Case_Agreement_Monitor_Planning.id', '=', childId)
    .where('Funding_Case_Agreement_Monitor_Planning._deleted', '=', false)
    .selectAll('Funding_Case_Agreement_Monitor_Planning').executeTakeFirst()
  if (!existing) return await badRequest(event, 'AGREEMENT_MONITOR_PLANNING_NOT_FOUND', 'apiErrors.agreement.monitor_planning_not_found')
  const monitorId = String(existing.egcs_fc_fundingagreementmonitor)
  const prepared = await prepareAgreementMonitorRoute(event, 'update', { entityType: 'fundingcasemonitor', entityId: monitorId })
  if (!prepared || !('agreementId' in prepared)) return prepared
  const { agreementId, agreementContext, db } = prepared
  const validated = await readAgreementMonitorBody(event, FundingCaseAgreementMonitorPlanningPatchSchema)
  if (Object.keys(validated).length === 0) return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  return await executeAgreementMonitorMutation(event, db, agreementId, agreementContext, monitorId, async trx => {
    const updated = await trx
      .updateTable('Funding_Case_Agreement_Monitor_Planning')
      .set(validated)
      .where('id', '=', childId)
      .where('egcs_fc_fundingagreementmonitor', '=', monitorId)
      .where('_deleted', '=', false)
      .returningAll()
      .executeTakeFirst()
    if (!updated) return await badRequest(event, 'AGREEMENT_MONITOR_PLANNING_NOT_FOUND', 'apiErrors.agreement.monitor_planning_not_found')
    return updated
  })
})
