import { defineEventHandler } from 'h3'
import { FundingOpportunityCreateSchema } from '~~/shared/types/schemas'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorize, authorizeWithFreshAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import type { JsonValue } from '~~/shared/types/database'
import { isFundingOpportunityNameAvailable, replaceFundingOpportunityStreams, resolveFundingOpportunityStreams } from '~~/server/utils/funding-opportunity-links'
import { sql } from 'kysely'
import { lockAgencyDraftStatus } from '~~/server/utils/business-status-runtime'
import { lockRegisteredExtensionAgreementScopes } from '~~/server/utils/extensions'
import { lockTransferPaymentStreams } from '~~/server/utils/transfer-payment-stream-lock'

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
    // Lock the selected lifecycle before consuming the earlier availability result.
    await lockRegisteredExtensionAgreementScopes(trx, currentStream.agencyId, streamIds)
    const agency = await trx.selectFrom('Agency_Profile').select('id')
      .where('id', '=', currentStream.agencyId).where('_deleted', '=', false)
      .forShare('Agency_Profile').executeTakeFirst()
    const profile = await trx.selectFrom('Transfer_Payment_Profile').select('egcs_tp_agency')
      .where('id', '=', currentStream.profileId).where('_deleted', '=', false)
      .where('egcs_tp_active', '=', true).forUpdate('Transfer_Payment_Profile').executeTakeFirst()
    if (!agency || !profile || String(profile.egcs_tp_agency) !== currentStream.agencyId) {
      return await badRequest(event, 'FUNDING_OPPORTUNITY_STREAM_CHANGED', 'apiErrors.request.invalid')
    }
    const lockedStreams = await lockTransferPaymentStreams(trx, streamIds)
    const lockedSelection = lockedStreams.size === streamIds.length
      ? await resolveFundingOpportunityStreams(trx, streamIds)
      : null
    if (!lockedSelection || lockedSelection.agencyId !== currentStream.agencyId
      || lockedSelection.profileId !== currentStream.profileId) {
      return await badRequest(event, 'FUNDING_OPPORTUNITY_STREAM_CHANGED', 'apiErrors.request.invalid')
    }
    if (!await isFundingOpportunityNameAvailable(trx, currentStream.profileId, streamIds, requested.egcs_fo_name_en, requested.egcs_fo_name_fr)) {
      return await badRequest(event, 'FUNDING_OPPORTUNITY_NAME_DUPLICATE', 'apiErrors.request.invalid')
    }
    const draftStatusId = await lockAgencyDraftStatus(trx, currentStream.agencyId)
    const opportunity = await trx.insertInto('Funding_Opportunity_Profile').values({
      egcs_fo_transferpaymentstream: streamId,
      egcs_fo_datestart: sql<Date>`${requested.egcs_fo_datestart.toISOString().slice(0, 10)}::date`,
      egcs_fo_dateend: sql<Date>`${requested.egcs_fo_dateend.toISOString().slice(0, 10)}::date`,
      egcs_fo_name_en: requested.egcs_fo_name_en,
      egcs_fo_name_fr: requested.egcs_fo_name_fr,
      egcs_fo_objective_en: requested.egcs_fo_objective_en,
      egcs_fo_objective_fr: requested.egcs_fo_objective_fr,
      egcs_fo_applicationschema: requested.egcs_fo_applicationschema as Record<string, JsonValue> | null,
      egcs_fo_status: draftStatusId
    }).returningAll().executeTakeFirstOrThrow()
    await replaceFundingOpportunityStreams(trx, String(opportunity.id), streamIds)
    return { ...opportunity, egcs_fo_transferpaymentstreams: streamIds }
  })
})
