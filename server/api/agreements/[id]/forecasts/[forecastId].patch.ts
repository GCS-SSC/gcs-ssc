import { FundingCaseAgreementForecastPatchSchema } from '~~/shared/types/schemas'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { badRequest } from '~~/server/utils/api-errors'
import {
  assertAgreementForecastBudgetFiscalYear,
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

  const prepared = await prepareAgreementForecastRoute(event, 'update', {
    entityType: 'fundingcaseforecast',
    entityId: forecastId
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  const patchValues = await readValidatedBodyI18n(event, FundingCaseAgreementForecastPatchSchema)
  return await executeAgreementForecastMutation(event, db, agreementId, agreementContext, [{ type: 'forecast', id: forecastId }], async trx => {
    const editable = await assertAgreementForecastEditable(event, trx, agreementId, forecastId)
    if (!editable || typeof editable !== 'object' || !('id' in editable)) return editable

    if (Object.hasOwn(patchValues, 'egcs_fc_fiscalyear')) {
      const fiscalYear = await assertAgreementForecastBudgetFiscalYear(
        event,
        trx,
        agreementId,
        patchValues.egcs_fc_fiscalyear as string
      )
      if (!fiscalYear || typeof fiscalYear !== 'object' || !('id' in fiscalYear)) {
        return fiscalYear
      }
      if (String(patchValues.egcs_fc_fiscalyear) !== String(editable.egcs_fc_fiscalyear)) {
        const existingLine = await trx
          .selectFrom('Funding_Case_Agreement_Forecast_Line_Item')
          .select('id')
          .where('egcs_fc_agreementforecast', '=', forecastId)
          .where('_deleted', '=', false)
          .forUpdate()
          .executeTakeFirst()
        if (existingLine) {
          return await badRequest(event, 'AGREEMENT_FORECAST_FISCAL_YEAR_IN_USE', 'apiErrors.request.invalid_status')
        }
      }
    }

    return await trx
      .updateTable('Funding_Case_Agreement_Forecast')
      .set(patchValues)
      .where('id', '=', forecastId)
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .returningAll()
      .executeTakeFirstOrThrow()
  })
})
