import { captureForecastCustomFields } from '~~/server/utils/agreement-claim-custom-fields'
import { defineEventHandler } from 'h3'
import { nextAgreementForecastVersion, copyActiveAgreementForecastLines } from '~~/server/utils/agreement-forecast-versions'
import { FundingCaseAgreementForecastCreateSchema } from '~~/shared/types/schemas'
import {
  assertAgreementForecastBudgetFiscalYear,
  prepareAgreementForecastRoute
} from '~~/server/utils/agreement-forecast'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { createPrimaryEntityAssignment, resolveAssignmentCommonUserId } from '~~/server/utils/entity-assignment'
import { badRequest, notFound, throwApiError } from '~~/server/utils/api-errors'
import { assertAgreementFinancialBudgetControls } from '~~/server/utils/agreement-financial-budget-controls'
import { lockAgencyDraftStatus } from '~~/server/utils/business-status-runtime'
import { isAgreementSubmittingProponentAvailable } from '~~/server/utils/agreement-submitting-proponent'

const forecastResponseColumns = [
  'id', 'egcs_fc_applicantrecipient', 'egcs_fc_fundingagreement', 'egcs_fc_fiscalyear', 'egcs_fc_version',
  'egcs_fc_status', 'egcs_fc_active', '_deleted', 'egcs_fc_customfields', 'egcs_fc_customfielddefinitions'
] as const

export default defineEventHandler(async event => {
  const prepared = await prepareAgreementForecastRoute(event, 'create')
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementForecastCreateSchema)

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, current, auth) => {
    const operationKey = validated.clientOperationId ? `${auth.userId}:${validated.clientOperationId.toLowerCase()}` : null
    const intent = JSON.stringify([
      validated.egcs_fc_fiscalyear, validated.egcs_fc_applicantrecipient, validated.egcs_fc_copyfromactive ?? false
    ])
    if (operationKey) {
      const existing = await trx.selectFrom('Funding_Case_Agreement_Forecast')
        .select(forecastResponseColumns)
        .select('egcs_fc_createoperationreceipt')
        .where('egcs_fc_fundingagreement', '=', agreementId)
        .where('egcs_fc_createoperationkey', '=', operationKey)
        .executeTakeFirst()
      if (existing) {
        const { egcs_fc_createoperationreceipt: receipt, ...forecast } = existing
        if (receipt?.intent !== intent) {
          return await throwApiError(event, {
            statusCode: 409,
            code: 'AGREEMENT_FORECAST_CREATE_OPERATION_CONFLICT',
            key: 'apiErrors.agreement.forecast_create_operation_conflict'
          })
        }
        return { ...forecast, ...(receipt.otherFundingOmitted ? { other_funding_omitted: true } : {}) }
      }
    }
    if (!await isAgreementSubmittingProponentAvailable(trx, agreementId, validated.egcs_fc_applicantrecipient)) {
      return await badRequest(event, 'AGREEMENT_FORECAST_PROPONENT_INVALID', 'apiErrors.agreement.invalid_forecast_proponent')
    }
    const fiscalYear = await assertAgreementForecastBudgetFiscalYear(event, trx, agreementId, validated.egcs_fc_fiscalyear)
    if (!fiscalYear || typeof fiscalYear !== 'object' || !('id' in fiscalYear)) {
      return fiscalYear
    }

    const creatorId = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!creatorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const draftStatusId = await lockAgencyDraftStatus(trx, current.agencyId)

    const forecast = await trx
      .insertInto('Funding_Case_Agreement_Forecast')
      .values({
        ...await captureForecastCustomFields(trx, current.streamId, undefined, event),
        egcs_fc_fundingagreement: agreementId,
        egcs_fc_applicantrecipient: validated.egcs_fc_applicantrecipient,
        egcs_fc_fiscalyear: String(fiscalYear.id),
        egcs_fc_version: await nextAgreementForecastVersion(trx, agreementId, String(fiscalYear.id)),
        egcs_fc_status: draftStatusId
      })
      .returning(forecastResponseColumns)
      .executeTakeFirstOrThrow()
    let otherFundingOmitted = false
    if (validated.egcs_fc_copyfromactive) {
      otherFundingOmitted = await copyActiveAgreementForecastLines(trx, agreementId, String(fiscalYear.id), String(forecast.id))
      await assertAgreementFinancialBudgetControls(trx, agreementId, { kind: 'forecast', id: String(forecast.id) })
    }
    if (operationKey) {
      await trx.updateTable('Funding_Case_Agreement_Forecast')
        .set({
          egcs_fc_createoperationkey: operationKey,
          egcs_fc_createoperationreceipt: { intent, otherFundingOmitted }
        })
        .where('id', '=', String(forecast.id))
        .executeTakeFirstOrThrow()
    }
    await createPrimaryEntityAssignment(trx, 'fundingcaseforecast', String(forecast.id), creatorId)
    return { ...forecast, ...(otherFundingOmitted ? { other_funding_omitted: true } : {}) }
  }, { action: 'create' })
})
