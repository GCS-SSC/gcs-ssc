import { FundingCaseAgreementMonitorItemsCreateSchema } from '~~/shared/types/schemas'
import { executeAgreementMonitorMutation, prepareAgreementMonitorRoute } from '~~/server/utils/agreement-monitor'

export default defineEventHandler(async event => {
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementMonitorItemsCreateSchema)
  const prepared = await prepareAgreementMonitorRoute(event, 'create', {
    entityType: 'fundingcasemonitor',
    entityId: validated.egcs_fc_fundingagreementmonitor
  })
  if (!prepared || !('agreementId' in prepared)) return prepared
  const { agreementId, agreementContext, db } = prepared
  return await executeAgreementMonitorMutation(event, db, agreementId, agreementContext, validated.egcs_fc_fundingagreementmonitor, async trx => {
    return await trx.insertInto('Funding_Case_Agreement_Monitor_Items').values(validated).returningAll().executeTakeFirstOrThrow()
  }, { action: 'create' })
})
