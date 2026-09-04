import { badRequest } from '~~/server/utils/api-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import {
  assertAgreementForecastEditable,
  executeAgreementForecastMutation,
  prepareAgreementForecastRoute
} from '~~/server/utils/agreement-forecast'

export default defineEventHandler(async event => {
  const forecastId = getRouterParam(event, 'forecastId')
  if (!forecastId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(forecastId)) {
    return await badRequest(event, 'AGREEMENT_FORECAST_NOT_FOUND', 'apiErrors.agreement.forecast_not_found')
  }

  const prepared = await prepareAgreementForecastRoute(event, 'delete', {
    entityType: 'fundingcaseforecast',
    entityId: forecastId
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared

  const result = await executeAgreementForecastMutation(event, db, agreementId, agreementContext, [{ type: 'forecast', id: forecastId }], async trx => {
    const editable = await assertAgreementForecastEditable(event, trx, agreementId, forecastId)
    if (!editable || typeof editable !== 'object' || !('id' in editable)) return editable

    const deleted = await trx
      .updateTable('Funding_Case_Agreement_Forecast')
      .set({ _deleted: true })
      .where('id', '=', forecastId)
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .returning('id')
      .executeTakeFirst()
    if (!deleted) {
      return await badRequest(event, 'AGREEMENT_FORECAST_NOT_FOUND', 'apiErrors.agreement.forecast_not_found')
    }

    await trx
      .updateTable('Funding_Case_Agreement_Forecast_Line_Item')
      .set({ _deleted: true })
      .where('egcs_fc_agreementforecast', '=', forecastId)
      .where('_deleted', '=', false)
      .execute()
  }, { action: 'delete' })

  return result ?? { success: true }
})
