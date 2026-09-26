import { FundingOpportunityCreateSchema } from '~~/shared/types/schemas'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorize, authorizeWithFreshAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import type { JsonValue } from '~~/shared/types/database'
import { isFundingOpportunityNameAvailable, replaceFundingOpportunityStreams, resolveFundingOpportunityStreams } from '~~/server/utils/funding-opportunity-links'
import { sql } from 'kysely'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const requested = await readValidatedBodyI18n(event, FundingOpportunityCreateSchema)
  const streamIds = requested.egcs_fo_transferpaymentstreams.map(String)
  const streamId = streamIds[0]!
  const stream = await resolveFundingOpportunityStreams(db, streamIds)
  if (!stream) return await badRequest(event, 'FUNDING_OPPORTUNITY_STREAM_INVALID', 'apiErrors.request.invalid')
  const programScope = { type: 'entity' as const, agencyId: stream.agencyId,
    path: [{ type: 'transfer_payment' as const, id: stream.profileId }] }
  await authorize(event, 'transfer_payment', 'create', programScope)

  return await db.transaction().execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    const currentStream = await resolveFundingOpportunityStreams(trx, streamIds)
    if (!currentStream || currentStream.agencyId !== stream.agencyId || currentStream.profileId !== stream.profileId) {
      return await badRequest(event, 'FUNDING_OPPORTUNITY_STREAM_CHANGED', 'apiErrors.request.invalid')
    }
    await authorizeWithFreshAuthContext(event, auth, 'transfer_payment', 'create', programScope)
    if (!await isFundingOpportunityNameAvailable(trx, currentStream.profileId, streamIds, requested.egcs_fo_name_en, requested.egcs_fo_name_fr)) {
      return await badRequest(event, 'FUNDING_OPPORTUNITY_NAME_DUPLICATE', 'apiErrors.request.invalid')
    }
    const opportunity = await trx.insertInto('Funding_Opportunity_Profile').values({
      egcs_fo_transferpaymentstream: streamId,
      egcs_fo_datestart: sql<Date>`${requested.egcs_fo_datestart.toISOString().slice(0, 10)}::date`,
      egcs_fo_dateend: sql<Date>`${requested.egcs_fo_dateend.toISOString().slice(0, 10)}::date`,
      egcs_fo_name_en: requested.egcs_fo_name_en,
      egcs_fo_name_fr: requested.egcs_fo_name_fr,
      egcs_fo_objective_en: requested.egcs_fo_objective_en,
      egcs_fo_objective_fr: requested.egcs_fo_objective_fr,
      egcs_fo_applicationschema: requested.egcs_fo_applicationschema as Record<string, JsonValue> | null,
      egcs_fo_status: 'draft'
    }).returningAll().executeTakeFirstOrThrow()
    await replaceFundingOpportunityStreams(trx, String(opportunity.id), streamIds)
    return { ...opportunity, egcs_fo_transferpaymentstreams: streamIds }
  })
})
