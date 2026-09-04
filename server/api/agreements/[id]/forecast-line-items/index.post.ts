import { sql } from 'kysely'
import { FundingCaseAgreementForecastLineItemCreateSchema } from '~~/shared/types/schemas'
import {
  assertAgreementForecastBudgetLineItem,
  executeAgreementForecastMutation,
  lockAgreementForecastEditable,
  prepareAgreementForecastRoute
} from '~~/server/utils/agreement-forecast'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'

export default defineEventHandler(async event => {
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementForecastLineItemCreateSchema)
  const prepared = await prepareAgreementForecastRoute(event, 'create', {
    entityType: 'fundingcaseforecast',
    entityId: validated.egcs_fc_agreementforecast
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared

  return await executeAgreementForecastMutation(
    event,
    db,
    agreementId,
    agreementContext,
    [{ type: 'forecast', id: validated.egcs_fc_agreementforecast }],
    async trx => {
      const forecast = await lockAgreementForecastEditable(event, trx, agreementId, validated.egcs_fc_agreementforecast)
      if (!forecast || typeof forecast !== 'object' || !('id' in forecast) || !('egcs_fc_fiscalyear' in forecast)) {
        return forecast
      }

      const budgetLineItem = await assertAgreementForecastBudgetLineItem(
        event,
        trx,
        agreementId,
        String(forecast.egcs_fc_fiscalyear),
        validated.egcs_fc_fundingagreementbudgetlineitem
      )
      if (!budgetLineItem || typeof budgetLineItem !== 'object' || !('id' in budgetLineItem)) {
        return budgetLineItem
      }

      const lineItem = await trx
        .insertInto('Funding_Case_Agreement_Forecast_Line_Item')
        .values({
          ...validated,
          egcs_fc_amount: databaseMoneyValue(validated.egcs_fc_amount)
        })
        .returning([
          'id',
          'egcs_fc_agreementforecast',
          'egcs_fc_fundingagreement',
          'egcs_fc_fundingagreementbudgetlineitem',
          'egcs_fc_month',
          databaseMoneyText(sql.ref('egcs_fc_amount')).as('egcs_fc_amount'),
          'egcs_fc_currency',
          'egcs_fc_version',
          '_deleted'
        ])
        .executeTakeFirstOrThrow()
      return { ...lineItem, egcs_fc_amount: parseDatabaseMoney(lineItem.egcs_fc_amount) }
    },
    { action: 'create' }
  )
})
