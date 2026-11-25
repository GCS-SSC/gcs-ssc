import { defineEventHandler, getRouterParam } from 'h3'
import { FundingCaseAgreementForecastPatchSchema } from '~~/shared/types/schemas'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { badRequest } from '~~/server/utils/api-errors'
import { assertAgreementForecastEditable, executeAgreementForecastMutation, prepareAgreementForecastRoute } from '~~/server/utils/agreement-forecast'
import { prepareFinancialCustomFieldPatch } from '~~/server/utils/agreement-claim-custom-fields'

export default defineEventHandler(async event => {
  const forecastId = getRouterParam(event, 'forecastId')
  if (!forecastId || !isPositivePostgresBigintText(forecastId)) {
    return await badRequest(event, 'AGREEMENT_FORECAST_NOT_FOUND', 'apiErrors.agreement.forecast_not_found')
  }
  const prepared = await prepareAgreementForecastRoute(event, 'update', {
    entityType: 'fundingcaseforecast', entityId: forecastId
  })
  if (!prepared || !('agreementId' in prepared)) return prepared
  const patch = await readValidatedBodyI18n(event, FundingCaseAgreementForecastPatchSchema)
  const { agreementId, agreementContext, db } = prepared

  return await executeAgreementForecastMutation(
    event, db, agreementId, agreementContext, [{ type: 'forecast', id: forecastId }],
    async trx => {
      await assertAgreementForecastEditable(event, trx, agreementId, forecastId)
      const forecast = await trx.selectFrom('Funding_Case_Agreement_Forecast')
        .select(['egcs_fc_customfielddefinitions', 'egcs_fc_customfields'])
        .where('id', '=', forecastId).where('egcs_fc_fundingagreement', '=', agreementId)
        .where('_deleted', '=', false).executeTakeFirstOrThrow()
      const answers = await prepareFinancialCustomFieldPatch(event, trx, {
        target: 'forecast', id: forecastId, agreementId,
        definitions: forecast.egcs_fc_customfielddefinitions, current: forecast.egcs_fc_customfields, patch
      })
      if (answers === undefined) return { customFieldsChanged: false }
      await trx.updateTable('Funding_Case_Agreement_Forecast').set({ egcs_fc_customfields: answers })
        .where('id', '=', forecastId).executeTakeFirstOrThrow()
      return { customFieldsChanged: true }
    }
  )
})
