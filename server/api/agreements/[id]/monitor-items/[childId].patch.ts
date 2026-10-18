import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { readAgreementMonitorBody } from '~~/server/utils/agreement-monitor-validation'
import { FundingCaseAgreementMonitorItemsCreateSchema, FundingCaseAgreementMonitorItemsPatchSchema } from '~~/shared/types/schemas'
import { parseI18n } from '~~/server/utils/api-validate'
import { badRequest } from '~~/server/utils/api-errors'
import { assertMonitorLinkedRecord, executeAgreementMonitorMutation, prepareAgreementMonitorRoute } from '~~/server/utils/agreement-monitor'

export default defineEventHandler(async event => {
  const childId = getRouterParam(event, 'childId')
  if (!childId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(childId)) return await badRequest(event, 'AGREEMENT_MONITOR_ITEM_NOT_FOUND', 'apiErrors.agreement.monitor_item_not_found')
  const existing = await event.context.$db.selectFrom('Funding_Case_Agreement_Monitor_Items').where('id', '=', childId).where('_deleted', '=', false).selectAll().executeTakeFirst()
  if (!existing) return await badRequest(event, 'AGREEMENT_MONITOR_ITEM_NOT_FOUND', 'apiErrors.agreement.monitor_item_not_found')
  const monitorId = String(existing.egcs_fc_fundingagreementmonitor)
  const prepared = await prepareAgreementMonitorRoute(event, 'update', { entityType: 'fundingcasemonitor', entityId: monitorId })
  if (!prepared || !('agreementId' in prepared)) return prepared
  const { agreementId, agreementContext, db } = prepared
  const validated = await readAgreementMonitorBody(event, FundingCaseAgreementMonitorItemsPatchSchema)
  if (Object.keys(validated).length === 0) return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  return await executeAgreementMonitorMutation(event, db, agreementId, agreementContext, monitorId, async trx => {
    const current = await trx.selectFrom('Funding_Case_Agreement_Monitor_Items')
      .where('id', '=', childId)
      .where('egcs_fc_fundingagreementmonitor', '=', monitorId)
      .where('_deleted', '=', false)
      .selectAll()
      .forUpdate()
      .executeTakeFirst()
    if (!current) return await badRequest(event, 'AGREEMENT_MONITOR_ITEM_NOT_FOUND', 'apiErrors.agreement.monitor_item_not_found')
    const patch = {
      ...validated,
      ...(Object.hasOwn(validated, 'egcs_fc_actualstart') ? { egcs_fc_actualstart: validated.egcs_fc_actualstart ?? null } : {}),
      ...(Object.hasOwn(validated, 'egcs_fc_actualend') ? { egcs_fc_actualend: validated.egcs_fc_actualend ?? null } : {})
    }
    await parseI18n(event, FundingCaseAgreementMonitorItemsCreateSchema, { ...current, ...patch })
    await assertMonitorLinkedRecord(event, trx, monitorId, 'planning', validated.egcs_fc_monitorplanning)
    const updated = await trx
      .updateTable('Funding_Case_Agreement_Monitor_Items')
      .set(patch)
      .where('id', '=', childId)
      .where('egcs_fc_fundingagreementmonitor', '=', monitorId)
      .where('_deleted', '=', false)
      .returningAll()
      .executeTakeFirst()
    if (!updated) return await badRequest(event, 'AGREEMENT_MONITOR_ITEM_NOT_FOUND', 'apiErrors.agreement.monitor_item_not_found')
    return updated
  })
})
