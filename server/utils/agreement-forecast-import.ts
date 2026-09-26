import type { Insertable, Transaction } from 'kysely'
import type {
  GcsExtensionAgreementForecastCreateInput,
  GcsExtensionAgreementForecastCreateResult
} from '@gcs-ssc/extensions/server'
import type { Database } from '~~/shared/types/database'
import { budgetFiscalYearStableId, budgetLineItemStableId } from '~~/server/utils/agreement-budget-lineage'
import { BusinessStatusViolation, lockAgencyDraftStatus } from '~~/server/utils/business-status-runtime'
import { databaseMoneyValue } from '~~/server/utils/database-money'
import { createPrimaryEntityAssignment } from '~~/server/utils/entity-assignment'
import { parseMoney } from '~~/shared/utils/money'

/**
 * Creates one inactive Draft Forecast with all monthly lines in the authorized transaction.
 * @param trx - Freshly authorized transaction.
 * @param input - Forecast header and monthly lines.
 * @param agencyId - Owning Agency.
 * @param creatorId - Active Common User receiving the primary assignment.
 * @returns Created Forecast and line identifiers, or an unavailable-domain outcome.
 */
export const createAgreementForecastAggregate = async (
  trx: Transaction<Database>,
  input: GcsExtensionAgreementForecastCreateInput,
  agencyId: string,
  creatorId: string
): Promise<GcsExtensionAgreementForecastCreateResult> => {
  const recipient = await trx.selectFrom('Funding_Case_Agreement_Applicant_Recipient')
    .select('id')
    .where('egcs_fc_fundingagreement', '=', input.agreementId)
    .where('egcs_fc_applicantrecipient', '=', input.applicantRecipientId)
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!recipient) return { status: 'recipient_unavailable' }

  const fiscalYear = await trx.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
    .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
    .select(budgetFiscalYearStableId.as('id'))
    .where(budgetFiscalYearStableId, '=', input.fiscalYearId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', input.agreementId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!fiscalYear) return { status: 'fiscal_year_unavailable' }

  if (input.lineItems.length === 0 || input.lineItems.length > 2400) {
    throw new Error('A Forecast requires 1 to 2400 monthly lines.')
  }
  const keys = input.lineItems.map(line => `${line.budgetLineItemId}:${line.month}`)
  if (new Set(keys).size !== keys.length || input.lineItems.some(line =>
    !Number.isInteger(line.month) || line.month < 0 || line.month > 11
    || !/^(0|[1-9]\d{0,18})$/.test(line.version)
    || BigInt(line.version) > BigInt('9223372036854775807')
  )) throw new Error('Forecast monthly lines contain an invalid or repeated budget line, month, or version.')

  const budgetIds = [...new Set(input.lineItems.map(line => line.budgetLineItemId))]
  const budget = await trx.selectFrom('Funding_Case_Agreement_Budget_Line_Item')
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year',
      'Funding_Case_Agreement_Budget_Fiscal_Year.id',
      'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear')
    .innerJoin('Funding_Case_Agreement_Budget_Version',
      'Funding_Case_Agreement_Budget_Version.id',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
    .select([budgetLineItemStableId.as('id'), 'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_currency as currency'])
    .where(budgetLineItemStableId, 'in', budgetIds)
    .where(budgetFiscalYearStableId, '=', input.fiscalYearId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', input.agreementId)
    .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .forUpdate()
    .execute()
  if (new Set(budget.map(line => String(line.id))).size !== budgetIds.length) {
    return { status: 'fiscal_year_unavailable' }
  }
  const currencyByLine = new Map(budget.map(line => [String(line.id), line.currency]))
  if (input.lineItems.some(line => currencyByLine.get(line.budgetLineItemId) !== line.currency)) {
    throw new Error('Forecast line currencies must match the current Agreement budget.')
  }

  let draftStatusId: string
  try {
    draftStatusId = await lockAgencyDraftStatus(trx, agencyId)
  } catch (error: unknown) {
    if (error instanceof BusinessStatusViolation && error.code === 'BUSINESS_STATUS_NOT_FOUND') {
      return { status: 'draft_status_unavailable' }
    }
    throw error
  }

  const forecast = await trx.insertInto('Funding_Case_Agreement_Forecast').values({
    egcs_fc_fundingagreement: input.agreementId,
    egcs_fc_fiscalyear: input.fiscalYearId,
    egcs_fc_status: draftStatusId,
    egcs_fc_active: false
  } satisfies Insertable<Database['Funding_Case_Agreement_Forecast']>)
    .returning('id').executeTakeFirstOrThrow()
  const lineItemIds: string[] = []
  for (const line of input.lineItems) {
    const inserted = await trx.insertInto('Funding_Case_Agreement_Forecast_Line_Item').values({
      egcs_fc_agreementforecast: String(forecast.id),
      egcs_fc_fundingagreementbudgetlineitem: line.budgetLineItemId,
      egcs_fc_month: line.month,
      egcs_fc_amount: databaseMoneyValue(parseMoney(line.amount)),
      egcs_fc_currency: line.currency as Database['Funding_Case_Agreement_Forecast_Line_Item']['egcs_fc_currency'],
      egcs_fc_version: line.version
    }).returning('id').executeTakeFirstOrThrow()
    lineItemIds.push(String(inserted.id))
  }
  await createPrimaryEntityAssignment(trx, 'fundingcaseforecast', String(forecast.id), creatorId)
  return { status: 'created', forecastId: String(forecast.id), lineItemIds, draftStatusId }
}
