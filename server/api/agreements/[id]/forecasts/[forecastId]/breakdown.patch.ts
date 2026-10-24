import { defineEventHandler, getRouterParam } from 'h3'
import { FundingCaseAgreementForecastBreakdownPatchSchema } from '~~/shared/types/schemas'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { authorize } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import { executeAgreementForecastMutation, prepareAgreementForecastRoute } from '~~/server/utils/agreement-forecast'
import { saveAgreementForecastBreakdown } from '~~/server/utils/agreement-forecast-breakdown'

export default defineEventHandler(async event => {
  await authorize(event, 'agreement', 'update', async () => ({
    scope: (await resolveAgreementScopeContext(getRouterParam(event, 'id') ?? '', event.context.$db))?.scope
      ?? { type: 'global' as const }
  }))
  const forecastId = getRouterParam(event, 'forecastId')
  if (!forecastId || !isPositivePostgresBigintText(forecastId)) {
    return await badRequest(event, 'AGREEMENT_FORECAST_NOT_FOUND', 'apiErrors.agreement.forecast_not_found')
  }
  const prepared = await prepareAgreementForecastRoute(event, 'update', {
    entityType: 'fundingcaseforecast', entityId: forecastId
  })
  if (!prepared || !('agreementId' in prepared)) return prepared
  const changes = await readValidatedBodyI18n(event, FundingCaseAgreementForecastBreakdownPatchSchema)
  const { agreementId, agreementContext, db } = prepared
  const actions = new Set<'create' | 'update'>(changes.cells.map(cell => cell.expected === null ? 'create' : 'update'))
  return await executeAgreementForecastMutation(
    event, db, agreementId, agreementContext, [{ type: 'forecast', id: forecastId }],
    async trx => await saveAgreementForecastBreakdown(event, trx, agreementId, forecastId, changes),
    { action: [...actions] }
  )
})
