import { FundingCaseAgreementMonitorFollowupUpdateCreateSchema } from '~~/shared/types/schemas'
import {
  assertAgreementMonitorFollowupExists,
  lockAgreementMonitorEditable,
  prepareAgreementMonitorRoute,
  syncAgreementMonitorFollowupStatus
} from '~~/server/utils/agreement-monitor'
import { badRequest } from '~~/server/utils/api-errors'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementMonitorFollowupUpdateCreateSchema)
  const followup = await event.context.$db
    .selectFrom('Funding_Case_Agreement_Monitor_Followup')
    .select('egcs_fc_fundingagreementmonitor')
    .where('id', '=', validated.egcs_fc_fundingagreementmonitorfollowup)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!followup) return await badRequest(event, 'AGREEMENT_MONITOR_FOLLOWUP_NOT_FOUND', 'apiErrors.agreement.monitor_followup_not_found')
  const prepared = await prepareAgreementMonitorRoute(event, 'create', {
    entityType: 'fundingcasemonitor',
    entityId: String(followup.egcs_fc_fundingagreementmonitor)
  })
  if (!prepared || !('agreementId' in prepared)) return prepared
  const { agreementId, agreementContext, db } = prepared
  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async trx => {
    const candidate = await trx
      .selectFrom('Funding_Case_Agreement_Monitor_Followup')
      .where('id', '=', validated.egcs_fc_fundingagreementmonitorfollowup)
      .where('_deleted', '=', false)
      .select('egcs_fc_fundingagreementmonitor')
      .executeTakeFirst()
    if (!candidate) {
      return await badRequest(event, 'AGREEMENT_MONITOR_FOLLOWUP_NOT_FOUND', 'apiErrors.agreement.monitor_followup_not_found')
    }

    const monitorId = String(candidate.egcs_fc_fundingagreementmonitor)
    const monitor = await lockAgreementMonitorEditable(event, trx, agreementId, monitorId)
    if (!monitor || typeof monitor !== 'object' || !('id' in monitor)) return monitor
    const lockedFollowup = await assertAgreementMonitorFollowupExists(
      event,
      trx,
      agreementId,
      monitorId,
      validated.egcs_fc_fundingagreementmonitorfollowup
    )
    if (!lockedFollowup || typeof lockedFollowup !== 'object' || !('id' in lockedFollowup)) return lockedFollowup

    const update = await trx.insertInto('Funding_Case_Agreement_Monitor_Followup_Update').values(validated).returningAll().executeTakeFirstOrThrow()
    await syncAgreementMonitorFollowupStatus(trx, validated.egcs_fc_fundingagreementmonitorfollowup)
    return update
  }, {
    action: 'create',
    /**
     * Resolves and locks the monitor aggregate owning the requested follow-up.
     * @param trx Active protected-write transaction.
     * @returns Exact monitor target, or null when the follow-up no longer exists.
     */
    assignmentTarget: async trx => {
      const followup = await trx.selectFrom('Funding_Case_Agreement_Monitor_Followup')
        .select('egcs_fc_fundingagreementmonitor')
        .where('id', '=', validated.egcs_fc_fundingagreementmonitorfollowup)
        .where('_deleted', '=', false)
        .forUpdate()
        .executeTakeFirst()
      if (!followup) return null
      return {
        entityType: 'fundingcasemonitor',
        entityId: String(followup.egcs_fc_fundingagreementmonitor)
      }
    }
  })
})
