import { TransferPaymentWizardSchema } from '~~/shared/types/schemas'
import {
  authorize,
  authorizeWithFreshAuthContext,
  requireFreshAuthContext
} from '~~/server/utils/authorize'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { databaseMoneyValue } from '~~/server/utils/database-money'

/**
 * Event handler for the Transfer Payment Wizard.
 * Creates a Transfer Payment Profile along with its outcomes, objectives, budgets, and performance indicators in a single transaction.
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const validated = await readValidatedBodyI18n(event, TransferPaymentWizardSchema)

  await authorize(event, 'transfer_payment', 'create', {
    type: 'agency',
    agencyId: validated.profile.egcs_tp_agency
  })

  try {
    const result = await db.transaction().execute(async trx => {
      const authContext = await requireFreshAuthContext(event, trx)
      const agency = await trx
        .selectFrom('Agency_Profile')
        .where('id', '=', validated.profile.egcs_tp_agency)
        .where('_deleted', '=', false)
        .select('id')
        .forUpdate('Agency_Profile')
        .executeTakeFirst()

      if (!agency) {
        return await badRequest(event, 'INVALID_AGENCY', 'apiErrors.request.invalid_agency')
      }

      await authorizeWithFreshAuthContext(event, authContext, 'transfer_payment', 'create', {
        type: 'agency',
        agencyId: String(agency.id)
      })

      if (validated.budgets.length > 0) {
        const fiscalYearIds = [...new Set(validated.budgets.map(budget => budget.egcs_tp_fiscalyear))]
        const fiscalYears = await trx
          .selectFrom('Agency_Fiscal_Year')
          .where('id', 'in', fiscalYearIds)
          .where('egcs_ay_organizationagency', '=', validated.profile.egcs_tp_agency)
          .where('_deleted', '=', false)
          .select('id')
          .execute()

        const fiscalYearSet = new Set(fiscalYears.map(item => String(item.id)))
        const invalidFiscalYear = fiscalYearIds.find(id => !fiscalYearSet.has(String(id)))
        if (invalidFiscalYear) {
          return await badRequest(event, 'INVALID_FISCAL_YEAR', 'apiErrors.transfer_payment.invalid_fiscal_year')
        }
      }

      const outcomeKey = (nameEn: string, nameFr: string) => `${nameEn.trim().toLowerCase()}|${nameFr.trim().toLowerCase()}`

      // 1. Create Transfer Payment Profile
      const profile = await trx
        .insertInto('Transfer_Payment_Profile')
        .values({
          egcs_tp_agency: validated.profile.egcs_tp_agency,
          egcs_tp_datestart: validated.profile.egcs_tp_datestart,
          egcs_tp_dateend: validated.profile.egcs_tp_dateend,
          egcs_tp_name_en: validated.profile.egcs_tp_name_en,
          egcs_tp_name_fr: validated.profile.egcs_tp_name_fr,
          egcs_tp_abbreviation_en: validated.profile.egcs_tp_abbreviation_en,
          egcs_tp_abbreviation_fr: validated.profile.egcs_tp_abbreviation_fr,
          egcs_tp_description_en: validated.profile.egcs_tp_description_en,
          egcs_tp_description_fr: validated.profile.egcs_tp_description_fr,
          egcs_tp_purpose_en: validated.profile.egcs_tp_purpose_en,
          egcs_tp_purpose_fr: validated.profile.egcs_tp_purpose_fr,
          egcs_tp_tclink: validated.profile.egcs_tp_tclink,
          egcs_tp_active: validated.profile.egcs_tp_active
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      // 2. Create Outcomes and map tempId to real ID
      const outcomeIdMap = new Map<string, string>()
      if (validated.outcomes.length > 0) {
        const createdOutcomes = await trx
          .insertInto('Transfer_Payment_Outcome')
          .values(
            validated.outcomes.map(outcome => ({
              egcs_tp_transferpaymentprofile: String(profile.id),
              egcs_tp_name_en: outcome.egcs_tp_name_en,
              egcs_tp_name_fr: outcome.egcs_tp_name_fr,
              egcs_tp_description_en: outcome.egcs_tp_description_en,
              egcs_tp_description_fr: outcome.egcs_tp_description_fr
            }))
          )
          .returning(['id', 'egcs_tp_name_en', 'egcs_tp_name_fr'])
          .execute()

        if (createdOutcomes.length !== validated.outcomes.length) {
          throw new Error(
            `Outcome insert count mismatch for wizard request: expected ${validated.outcomes.length}, got ${createdOutcomes.length}`
          )
        }

        const createdOutcomeByKey = new Map<string, { id: string | number }>()
        for (const created of createdOutcomes) {
          const key = outcomeKey(created.egcs_tp_name_en, created.egcs_tp_name_fr)
          if (createdOutcomeByKey.has(key)) {
            throw new Error(`Duplicate created outcome key detected after insert: "${key}"`)
          }
          createdOutcomeByKey.set(key, created)
        }

        for (const outcome of validated.outcomes) {
          const key = outcomeKey(outcome.egcs_tp_name_en, outcome.egcs_tp_name_fr)
          const created = createdOutcomeByKey.get(key)
          if (!created) {
            throw new Error(`Missing created outcome mapping for temp outcome "${outcome.tempId}" using key "${key}"`)
          }
          outcomeIdMap.set(outcome.tempId, String(created.id))
        }
      }

      // 3. Create Objectives
      if (validated.objectives.length > 0) {
        await trx
          .insertInto('Transfer_Payment_Objective')
          .values(
            validated.objectives.map(obj => ({
              egcs_tp_transferpaymentprofile: String(profile.id),
              egcs_tp_objective_en: obj.egcs_tp_objective_en,
              egcs_tp_objective_fr: obj.egcs_tp_objective_fr
            }))
          )
          .execute()
      }

      // 4. Create Budgets
      if (validated.budgets.length > 0) {
        await trx
          .insertInto('Transfer_Payment_Fiscal_Year_Budget')
          .values(
            validated.budgets.map(budget => ({
              egcs_tp_transferpaymentprofile: String(profile.id),
              egcs_tp_fiscalyear: budget.egcs_tp_fiscalyear,
              egcs_tp_totalbudget: databaseMoneyValue(budget.egcs_tp_totalbudget),
              egcs_tp_overcommitthreshold: budget.egcs_tp_overcommitthreshold
            }))
          )
          .execute()
      }

      // 5. Create Performance Indicators linked to outcomes
      if (validated.performanceIndicators.length > 0) {
        const performanceIndicatorRows = validated.performanceIndicators.map(pi => {
          const outcomeId = outcomeIdMap.get(pi.tempOutcomeId)
          if (!outcomeId) {
            throw new Error(`Missing mapped outcome ID after pre-validation for temp outcome "${pi.tempOutcomeId}"`)
          }

          return {
            egcs_tp_transferpaymentoutcome: outcomeId,
            egcs_tp_name_en: pi.egcs_tp_name_en,
            egcs_tp_name_fr: pi.egcs_tp_name_fr,
            egcs_tp_description_en: pi.egcs_tp_description_en,
            egcs_tp_description_fr: pi.egcs_tp_description_fr
          }
        })

        await trx
          .insertInto('Transfer_Payment_Outcome_Performance_Indicator')
          .values(performanceIndicatorRows)
          .execute()
      }

      return profile
    })

    return result
  } catch (error) {
    return await throwIfTransferPaymentUniqueConstraintError(event, error)
  }
})
