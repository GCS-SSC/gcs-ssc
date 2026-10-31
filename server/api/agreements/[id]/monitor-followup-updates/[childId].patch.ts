import { resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { authorize } from '~~/server/utils/authorize'
import { defineEventHandler, getRouterParam } from 'h3'
import { readAgreementMonitorBody } from '~~/server/utils/agreement-monitor-validation'
import { FundingCaseAgreementMonitorFollowupUpdatePatchSchema } from '~~/shared/types/schemas'
import { badRequest } from '~~/server/utils/api-errors'
import {
  executeAgreementMonitorMutation,
  prepareAgreementMonitorRoute,
  syncAgreementMonitorFollowupStatus
} from '~~/server/utils/agreement-monitor'
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
  if (!isPositivePostgresBigintText(childId)) return await badRequest(event, 'AGREEMENT_MONITOR_FOLLOWUP_UPDATE_NOT_FOUND', 'apiErrors.agreement.monitor_followup_update_not_found')
  const existing = await event.context.$db.selectFrom('Funding_Case_Agreement_Monitor_Followup_Update')
    .innerJoin('Funding_Case_Agreement_Monitor_Followup as owner_followup', 'owner_followup.id', 'Funding_Case_Agreement_Monitor_Followup_Update.egcs_fc_fundingagreementmonitorfollowup')
    .innerJoin('Funding_Case_Agreement_Monitor as owner_monitor', 'owner_monitor.id', 'owner_followup.egcs_fc_fundingagreementmonitor')
    .where('owner_followup._deleted', '=', false)
    .where('owner_monitor.egcs_fc_fundingagreement', '=', routeAgreementId)
    .where('owner_monitor._deleted', '=', false)
    .where('Funding_Case_Agreement_Monitor_Followup_Update.id', '=', childId)
    .where('Funding_Case_Agreement_Monitor_Followup_Update._deleted', '=', false)
    .selectAll('Funding_Case_Agreement_Monitor_Followup_Update').executeTakeFirst()
  if (!existing) return await badRequest(event, 'AGREEMENT_MONITOR_FOLLOWUP_UPDATE_NOT_FOUND', 'apiErrors.agreement.monitor_followup_update_not_found')
  const followup = await event.context.$db.selectFrom('Funding_Case_Agreement_Monitor_Followup').where('id', '=', String(existing.egcs_fc_fundingagreementmonitorfollowup)).where('_deleted', '=', false).selectAll().executeTakeFirst()
  if (!followup) return await badRequest(event, 'AGREEMENT_MONITOR_FOLLOWUP_NOT_FOUND', 'apiErrors.agreement.monitor_followup_not_found')
  const monitorId = String(followup.egcs_fc_fundingagreementmonitor)
  const prepared = await prepareAgreementMonitorRoute(event, 'update', { entityType: 'fundingcasemonitor', entityId: monitorId })
  if (!prepared || !('agreementId' in prepared)) return prepared
  const { agreementId, agreementContext, db } = prepared
  const validated = await readAgreementMonitorBody(event, FundingCaseAgreementMonitorFollowupUpdatePatchSchema)
  if (Object.keys(validated).length === 0) return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  const followupId = String(existing.egcs_fc_fundingagreementmonitorfollowup)
  return await executeAgreementMonitorMutation(event, db, agreementId, agreementContext, monitorId, async trx => {
    const update = await trx.updateTable('Funding_Case_Agreement_Monitor_Followup_Update').set(validated).where('id', '=', childId).where('egcs_fc_fundingagreementmonitorfollowup', '=', followupId).where('_deleted', '=', false).returningAll().executeTakeFirst()
    if (!update) return await badRequest(event, 'AGREEMENT_MONITOR_FOLLOWUP_UPDATE_NOT_FOUND', 'apiErrors.agreement.monitor_followup_update_not_found')
    await syncAgreementMonitorFollowupStatus(trx, followupId, { event })
    return update
  })
})
