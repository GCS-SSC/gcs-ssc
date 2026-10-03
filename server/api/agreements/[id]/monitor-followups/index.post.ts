import { FundingCaseAgreementMonitorFollowupCreateSchema } from '~~/shared/types/schemas'
import { assertMonitorReceivableEligible, assertMonitorLinkedRecord, executeAgreementMonitorMutation, prepareAgreementMonitorRoute } from '~~/server/utils/agreement-monitor'

export default defineEventHandler(async event => {
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementMonitorFollowupCreateSchema)
  const prepared = await prepareAgreementMonitorRoute(event, 'create', {
    entityType: 'fundingcasemonitor',
    entityId: validated.egcs_fc_fundingagreementmonitor
  })
  if (!prepared || !('agreementId' in prepared)) return prepared
  const { agreementId, agreementContext, db } = prepared
  return await executeAgreementMonitorMutation(event, db, agreementId, agreementContext, validated.egcs_fc_fundingagreementmonitor, async trx => {
    await assertMonitorReceivableEligible(event, trx, validated.egcs_fc_fundingagreementmonitor, validated.egcs_fc_requiresreceivable)
    await assertMonitorLinkedRecord(event, trx, validated.egcs_fc_fundingagreementmonitor, 'finding', validated.egcs_fc_monitorfinding)
    return await trx.insertInto('Funding_Case_Agreement_Monitor_Followup').values({
      ...validated,
      egcs_fc_status: 'open'
    }).returningAll().executeTakeFirstOrThrow()
  }, { action: 'create' })
})
