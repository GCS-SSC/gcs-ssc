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
import { notFound } from '~~/server/utils/api-errors'
import { assertAgreementFinancialBudgetControls } from '~~/server/utils/agreement-financial-budget-controls'
import { lockAgencyDraftStatus } from '~~/server/utils/business-status-runtime'

export default defineEventHandler(async event => {
  const prepared = await prepareAgreementForecastRoute(event, 'create')
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementForecastCreateSchema)

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, current, auth) => {
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
        egcs_fc_fiscalyear: String(fiscalYear.id),
        egcs_fc_version: await nextAgreementForecastVersion(trx, agreementId, String(fiscalYear.id)),
        egcs_fc_status: draftStatusId
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    let otherFundingOmitted = false
    if (validated.egcs_fc_copyfromactive) {
      otherFundingOmitted = await copyActiveAgreementForecastLines(trx, agreementId, String(fiscalYear.id), String(forecast.id))
      await assertAgreementFinancialBudgetControls(trx, agreementId, { kind: 'forecast', id: String(forecast.id) })
    }
    await createPrimaryEntityAssignment(trx, 'fundingcaseforecast', String(forecast.id), creatorId)
    return { ...forecast, ...(otherFundingOmitted ? { other_funding_omitted: true } : {}) }
  }, { action: 'create' })
})
