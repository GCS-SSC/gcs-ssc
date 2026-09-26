import { FundingOpportunityPatchSchema } from '~~/shared/types/schemas'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { requireFundingOpportunityAccess } from '~~/server/utils/funding-case-access'
import { replaceFundingOpportunityLinks, validateFundingOpportunityLinks } from '~~/server/utils/funding-opportunity-links'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import type { JsonValue } from '~~/shared/types/database'

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
    const reviewIds = requested.egcs_fo_reviewsetups?.map(String)
    const workflowIds = requested.egcs_fo_workflowsetups?.map(String)
    if ((reviewIds || workflowIds) && !await validateFundingOpportunityLinks(
      trx, scope.streamId, scope.agencyId, reviewIds ?? [], workflowIds ?? []
    )) return await badRequest(event, 'FUNDING_OPPORTUNITY_SETUP_INVALID', 'apiErrors.request.invalid')
    const { egcs_fo_reviewsetups: _reviewSetups, egcs_fo_workflowsetups: _workflowSetups, ...fields } = requested
    const updated = Object.keys(fields).length
      ? await trx.updateTable('Funding_Opportunity_Profile').set({
          ...fields,
          ...(fields.egcs_fo_applicationschema !== undefined
            ? { egcs_fo_applicationschema: fields.egcs_fo_applicationschema as Record<string, JsonValue> | null }
            : {})
        }).where('id', '=', id).returningAll().executeTakeFirstOrThrow()
      : current
    if (reviewIds) await replaceFundingOpportunityLinks(trx, id, 'review', reviewIds)
    if (workflowIds) await replaceFundingOpportunityLinks(trx, id, 'workflow', workflowIds)
    return updated
  })
})
