import type { Insertable } from 'kysely'
import { FundingCaseAgreementForecastCreateSchema } from '~~/shared/types/schemas'
import type { FundingCaseAgreementForecastTable } from '~~/shared/types/database'
import {
  assertAgreementForecastBudgetFiscalYear,
  prepareAgreementForecastRoute
} from '~~/server/utils/agreement-forecast'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { createPrimaryEntityAssignment, resolveAssignmentCommonUserId } from '~~/server/utils/entity-assignment'
import { notFound } from '~~/server/utils/api-errors'
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
        egcs_fc_fundingagreement: agreementId,
        egcs_fc_fiscalyear: validated.egcs_fc_fiscalyear,
        egcs_fc_status: draftStatusId
      } satisfies Insertable<FundingCaseAgreementForecastTable>)
      .returningAll()
      .executeTakeFirstOrThrow()
    await createPrimaryEntityAssignment(trx, 'fundingcaseforecast', String(forecast.id), creatorId)
    return forecast
  }, { action: 'create' })
})
