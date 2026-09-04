/* eslint-disable jsdoc/require-jsdoc -- Export names describe the duration validation contract. */
import type { H3Event } from 'h3'
import { sql, type Kysely, type Transaction } from 'kysely'
import { badRequest } from '~~/server/utils/api-errors'
import type { Database } from '~~/shared/types/database'

export const fiscalYearOverlapsDuration = (
  fiscalYearStart: Date,
  fiscalYearEnd: Date,
  durationStart: Date,
  durationEnd: Date
) => fiscalYearStart <= durationEnd && fiscalYearEnd >= durationStart

export const assertFiscalYearOverlapsDuration = async (
  event: H3Event,
  fiscalYear: { egcs_ay_startdate: Date, egcs_ay_enddate: Date },
  duration: { startDate: Date, endDate: Date }
) => {
  if (fiscalYearOverlapsDuration(
    fiscalYear.egcs_ay_startdate,
    fiscalYear.egcs_ay_enddate,
    duration.startDate,
    duration.endDate
  )) return null

  return await badRequest(
    event,
    'AGREEMENT_FISCAL_YEAR_OUTSIDE_DURATION',
    'apiErrors.agreement.fiscal_year_outside_duration'
  )
}

/**
 * Resolves proposed amendment dates, falling back to the current Agreement duration for budget-only amendments.
 *
 * @param db - Database connection used to resolve the amendment and Agreement.
 * @param amendmentId - Amendment whose effective duration is required.
 * @returns Effective start and end dates for fiscal-year validation.
 */
export const resolveAgreementAmendmentEffectiveDuration = async (
  db: Kysely<Database> | Transaction<Database>,
  amendmentId: string
): Promise<{ startDate: Date, endDate: Date }> => await db
  .selectFrom('Funding_Case_Agreement_Amendment')
  .innerJoin('Funding_Case_Agreement_Profile', 'Funding_Case_Agreement_Profile.id', 'Funding_Case_Agreement_Amendment.egcs_fc_fundingagreement')
  .select([
    sql<Date>`COALESCE("Funding_Case_Agreement_Amendment"."egcs_fc_proposedauthorizedassistancestartdate", "Funding_Case_Agreement_Profile"."egcs_fc_authorizedassistancestartdate")`.as('startDate'),
    sql<Date>`COALESCE("Funding_Case_Agreement_Amendment"."egcs_fc_proposedauthorizedassistanceenddate", "Funding_Case_Agreement_Profile"."egcs_fc_authorizedassistanceenddate")`.as('endDate')
  ])
  .where('Funding_Case_Agreement_Amendment.id', '=', amendmentId)
  .where('Funding_Case_Agreement_Amendment._deleted', '=', false)
  .where('Funding_Case_Agreement_Profile._deleted', '=', false)
  .executeTakeFirstOrThrow()

export const assertFiscalYearOverlapsAmendmentDuration = async (
  event: H3Event,
  db: Kysely<Database> | Transaction<Database>,
  amendmentId: string,
  fiscalYear: { egcs_ay_startdate: Date, egcs_ay_enddate: Date }
) => {
  const amendmentDuration = await resolveAgreementAmendmentEffectiveDuration(db, amendmentId)

  return await assertFiscalYearOverlapsDuration(event, fiscalYear, {
    startDate: amendmentDuration.startDate,
    endDate: amendmentDuration.endDate
  })
}

export const assertAgreementBudgetFiscalYearsOverlapDuration = async (
  event: H3Event,
  db: Kysely<Database> | Transaction<Database>,
  agreementId: string,
  duration: { startDate: Date, endDate: Date },
  budgetVersionId?: string
) => {
  const fiscalYearsOverlap = await agreementBudgetFiscalYearsOverlapDuration(
    db,
    agreementId,
    duration,
    budgetVersionId
  )

  return fiscalYearsOverlap
    ? null
    : await badRequest(event, 'AGREEMENT_FISCAL_YEAR_OUTSIDE_DURATION', 'apiErrors.agreement.fiscal_year_outside_duration')
}

export const agreementBudgetFiscalYearsOverlapDuration = async (
  db: Kysely<Database> | Transaction<Database>,
  agreementId: string,
  duration: { startDate: Date, endDate: Date },
  budgetVersionId?: string
): Promise<boolean> => {
  let query = db.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
    .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
    .innerJoin(
      'Funding_Case_Agreement_Budget_Version',
      'Funding_Case_Agreement_Budget_Version.id',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion'
    )
    .select(['Agency_Fiscal_Year.egcs_ay_startdate', 'Agency_Fiscal_Year.egcs_ay_enddate'])
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Agency_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)

  if (budgetVersionId) {
    query = query.where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion', '=', budgetVersionId)
  } else {
    query = query
      .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
  }

  const fiscalYears = await query.execute()
  const invalidFiscalYear = fiscalYears.find(fiscalYear => !fiscalYearOverlapsDuration(
    fiscalYear.egcs_ay_startdate,
    fiscalYear.egcs_ay_enddate,
    duration.startDate,
    duration.endDate
  ))

  return !invalidFiscalYear
}
