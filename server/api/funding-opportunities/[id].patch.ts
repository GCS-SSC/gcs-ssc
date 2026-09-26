import { FundingOpportunityPatchSchema } from '~~/shared/types/schemas'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { requireFundingOpportunityAccess } from '~~/server/utils/funding-case-access'
import { isFundingOpportunityNameAvailable, listFundingOpportunityStreamIds, replaceFundingOpportunityLinks, replaceFundingOpportunityStreams, resolveFundingOpportunityStreams, validateFundingOpportunityLinks } from '~~/server/utils/funding-opportunity-links'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import type { JsonValue } from '~~/shared/types/database'
import { sql } from 'kysely'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const id = getRouterParam(event, 'id')
  if (!id) return await notFound(event, 'FUNDING_OPPORTUNITY_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const requested = await readValidatedBodyI18n(event, FundingOpportunityPatchSchema)
  const db = event.context.$db
  await requireFundingOpportunityAccess(event, id, 'update', db)
  return await db.transaction().execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    const scope = await requireFundingOpportunityAccess(event, id, 'update', trx, auth)
    const current = await trx.selectFrom('Funding_Opportunity_Profile').selectAll()
      .where('id', '=', id).where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!current) return await notFound(event, 'FUNDING_OPPORTUNITY_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const dateStart = requested.egcs_fo_datestart ?? current.egcs_fo_datestart
    const dateEnd = requested.egcs_fo_dateend ?? current.egcs_fo_dateend
    if (new Date(dateEnd).getTime() < new Date(dateStart).getTime()) {
      return await badRequest(event, 'FUNDING_OPPORTUNITY_DATE_RANGE', 'validation.date_range')
    }
    const streamIds = requested.egcs_fo_transferpaymentstreams?.map(String)
      ?? await listFundingOpportunityStreamIds(trx, id)
    const selectedStream = requested.egcs_fo_transferpaymentstreams
      ? await resolveFundingOpportunityStreams(trx, streamIds)
      : { profileId: scope.transferPaymentId, agencyId: scope.agencyId }
    if (!selectedStream || selectedStream.profileId !== scope.transferPaymentId || selectedStream.agencyId !== scope.agencyId) {
      return await badRequest(event, 'FUNDING_OPPORTUNITY_STREAM_INVALID', 'apiErrors.request.invalid')
    }
    if (!await isFundingOpportunityNameAvailable(trx, scope.transferPaymentId, streamIds,
      requested.egcs_fo_name_en ?? current.egcs_fo_name_en,
      requested.egcs_fo_name_fr ?? current.egcs_fo_name_fr, id)) {
      return await badRequest(event, 'FUNDING_OPPORTUNITY_NAME_DUPLICATE', 'apiErrors.request.invalid')
    }
    const [retainedReviews, retainedWorkflows] = await Promise.all([
      trx.selectFrom('Funding_Opportunity_Review_Set').select('egcs_fo_reviewsetsetup')
        .where('egcs_fo_fundingopportunity', '=', id).where('_deleted', '=', false).execute(),
      trx.selectFrom('Funding_Opportunity_Workflow').select('egcs_fo_workflowsetup')
        .where('egcs_fo_fundingopportunity', '=', id).where('_deleted', '=', false).execute()
    ])
    const reviewIds = requested.egcs_fo_reviewsetups?.map(String)
      ?? retainedReviews.map(row => String(row.egcs_fo_reviewsetsetup))
    const workflowIds = requested.egcs_fo_workflowsetups?.map(String)
      ?? retainedWorkflows.map(row => String(row.egcs_fo_workflowsetup))
    if ((requested.egcs_fo_transferpaymentstreams || requested.egcs_fo_reviewsetups || requested.egcs_fo_workflowsetups)
      && !await validateFundingOpportunityLinks(trx, streamIds, scope.agencyId, reviewIds, workflowIds)) {
      return await badRequest(event, 'FUNDING_OPPORTUNITY_SETUP_INVALID', 'apiErrors.request.invalid')
    }
    const { egcs_fo_transferpaymentstreams: _streams, egcs_fo_reviewsetups: _reviewSetups, egcs_fo_workflowsetups: _workflowSetups, ...fields } = requested
    const updated = Object.keys(fields).length || streamIds[0] !== String(current.egcs_fo_transferpaymentstream)
      ? await trx.updateTable('Funding_Opportunity_Profile').set({
          ...fields,
          egcs_fo_transferpaymentstream: streamIds[0]!,
          ...(fields.egcs_fo_datestart !== undefined
            ? { egcs_fo_datestart: sql<Date>`${fields.egcs_fo_datestart.toISOString().slice(0, 10)}::date` }
            : {}),
          ...(fields.egcs_fo_dateend !== undefined
            ? { egcs_fo_dateend: sql<Date>`${fields.egcs_fo_dateend.toISOString().slice(0, 10)}::date` }
            : {}),
          ...(fields.egcs_fo_applicationschema !== undefined
            ? { egcs_fo_applicationschema: fields.egcs_fo_applicationschema as Record<string, JsonValue> | null }
            : {})
        }).where('id', '=', id).returningAll().executeTakeFirstOrThrow()
      : current
    if (requested.egcs_fo_transferpaymentstreams) await replaceFundingOpportunityStreams(trx, id, streamIds)
    if (requested.egcs_fo_reviewsetups) await replaceFundingOpportunityLinks(trx, id, 'review', reviewIds)
    if (requested.egcs_fo_workflowsetups) await replaceFundingOpportunityLinks(trx, id, 'workflow', workflowIds)
    return { ...updated, egcs_fo_transferpaymentstreams: streamIds }
  })
})
