import { FundingOpportunityCreateSchema } from '~~/shared/types/schemas'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorize, authorizeWithFreshAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { resolveAgreementStreamScopeContext } from '~~/server/utils/agreement'
import { badRequest } from '~~/server/utils/api-errors'
import type { JsonValue } from '~~/shared/types/database'
import { replaceFundingOpportunityLinks, validateFundingOpportunityLinks } from '~~/server/utils/funding-opportunity-links'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const requested = await readValidatedBodyI18n(event, FundingOpportunityCreateSchema)
  const streamId = String(requested.egcs_fo_transferpaymentstream)
  const stream = await resolveAgreementStreamScopeContext(streamId, db, { requireAvailable: true })
  if (!stream) return await badRequest(event, 'FUNDING_OPPORTUNITY_STREAM_INVALID', 'apiErrors.request.invalid')
  await authorize(event, 'transfer_payment', 'create', stream.scope)

  return await db.transaction().execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    const currentStream = await resolveAgreementStreamScopeContext(streamId, trx, { requireAvailable: true })
    if (!currentStream || currentStream.agencyId !== stream.agencyId || currentStream.profileId !== stream.profileId) {
      return await badRequest(event, 'FUNDING_OPPORTUNITY_STREAM_CHANGED', 'apiErrors.request.invalid')
    }
    await authorizeWithFreshAuthContext(event, auth, 'transfer_payment', 'create', currentStream.scope)
    const reviewIds = requested.egcs_fo_reviewsetups.map(String)
    const workflowIds = requested.egcs_fo_workflowsetups.map(String)
    if (!await validateFundingOpportunityLinks(trx, streamId, currentStream.agencyId, reviewIds, workflowIds)) {
      return await badRequest(event, 'FUNDING_OPPORTUNITY_SETUP_INVALID', 'apiErrors.request.invalid')
    }
    const opportunity = await trx.insertInto('Funding_Opportunity_Profile').values({
      egcs_fo_transferpaymentstream: streamId,
      egcs_fo_datestart: requested.egcs_fo_datestart,
      egcs_fo_dateend: requested.egcs_fo_dateend,
      egcs_fo_name_en: requested.egcs_fo_name_en,
      egcs_fo_name_fr: requested.egcs_fo_name_fr,
      egcs_fo_objective_en: requested.egcs_fo_objective_en,
      egcs_fo_objective_fr: requested.egcs_fo_objective_fr,
      egcs_fo_applicationschema: requested.egcs_fo_applicationschema as Record<string, JsonValue> | null,
      egcs_fo_status: requested.egcs_fo_status
    }).returningAll().executeTakeFirstOrThrow()
    await replaceFundingOpportunityLinks(trx, String(opportunity.id), 'review', reviewIds)
    await replaceFundingOpportunityLinks(trx, String(opportunity.id), 'workflow', workflowIds)
    return opportunity
  })
})
