import { badRequest } from '~~/server/utils/api-errors'
import { assertAgreementForecastEditable, executeAgreementForecastMutation, prepareAgreementForecastRoute } from '~~/server/utils/agreement-forecast'
import { resolveForecastLineAssignmentTarget } from '~~/server/utils/agreement-assignment-target'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const lineId = getRouterParam(event, 'lineId')
  if (!lineId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(lineId)) {
    return await badRequest(event, 'AGREEMENT_FORECAST_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.forecast_line_item_not_found')
  }

  const assignmentTarget = await resolveForecastLineAssignmentTarget(event.context.$db, lineId)
  if (!assignmentTarget) return await badRequest(event, 'AGREEMENT_FORECAST_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.forecast_line_item_not_found')
  const prepared = await prepareAgreementForecastRoute(event, 'delete', assignmentTarget)
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  const result = await executeAgreementForecastMutation(event, db, agreementId, agreementContext, async trx => {
    const child = await trx.selectFrom('Funding_Case_Agreement_Forecast_Line_Item').select('egcs_fc_agreementforecast').where('id', '=', lineId).where('_deleted', '=', false).executeTakeFirst()
    return child ? [{ type: 'forecast', id: String(child.egcs_fc_agreementforecast) }] : []
  }, async trx => {
    const existing = await trx
      .selectFrom('Funding_Case_Agreement_Forecast_Line_Item')
      .innerJoin(
        'Funding_Case_Agreement_Forecast',
        'Funding_Case_Agreement_Forecast.id',
        'Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_agreementforecast'
      )
      .where('Funding_Case_Agreement_Forecast_Line_Item.id', '=', lineId)
      .where('Funding_Case_Agreement_Forecast.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Forecast_Line_Item._deleted', '=', false)
      .where('Funding_Case_Agreement_Forecast._deleted', '=', false)
      .select('Funding_Case_Agreement_Forecast_Line_Item.egcs_fc_agreementforecast as egcs_fc_agreementforecast')
      .executeTakeFirst()

    if (!existing) {
      return await badRequest(event, 'AGREEMENT_FORECAST_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.forecast_line_item_not_found')
    }

    const editable = await assertAgreementForecastEditable(event, trx, agreementId, String(existing.egcs_fc_agreementforecast))
    if (!editable || typeof editable !== 'object' || !('id' in editable)) return editable
    await trx.updateTable('Funding_Case_Agreement_Forecast_Line_Item').set({ _deleted: true }).where('id', '=', lineId).where('egcs_fc_agreementforecast', '=', existing.egcs_fc_agreementforecast).where('_deleted', '=', false).execute()
  }, { action: 'delete' })

  return result ?? { success: true }
})
