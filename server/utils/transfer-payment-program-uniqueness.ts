import { normalizeTextKey } from '~~/server/utils/transfer-payment-uniqueness'

/**
 * Builds a unique key for a transfer payment program stream name.
 *
 * @param input - The input object containing program stream name details.
 * @param input.egcs_tp_name_en - English name of the program stream.
 * @param input.egcs_tp_name_fr - French name of the program stream.
 * @returns The generated unique key.
 */
export const buildProgramStreamNameKey = (input: {
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
}): string => {
  return [normalizeTextKey(input.egcs_tp_name_en), normalizeTextKey(input.egcs_tp_name_fr)].join('|')
}

/**
 * Builds a unique key for a transfer payment outcome name.
 *
 * @param input - The input object containing outcome name details.
 * @param input.egcs_tp_name_en - English name of the outcome.
 * @param input.egcs_tp_name_fr - French name of the outcome.
 * @returns The generated unique key.
 */
export const buildOutcomeNameKey = (input: {
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
}): string => {
  return [normalizeTextKey(input.egcs_tp_name_en), normalizeTextKey(input.egcs_tp_name_fr)].join('|')
}

/**
 * Builds a unique key for a transfer payment objective.
 *
 * @param input - The input object containing objective details.
 * @param input.egcs_tp_objective_en - English objective text.
 * @param input.egcs_tp_objective_fr - French objective text.
 * @returns The generated unique key.
 */
export const buildObjectiveKey = (input: {
  egcs_tp_objective_en: string
  egcs_tp_objective_fr: string
}): string => {
  return [normalizeTextKey(input.egcs_tp_objective_en), normalizeTextKey(input.egcs_tp_objective_fr)].join('|')
}

/**
 * Builds a unique key for a transfer payment budget fiscal year.
 *
 * @param input - The input object containing fiscal year.
 * @param input.egcs_tp_fiscalyear - The fiscal year ID or label.
 * @returns The generated unique key.
 */
export const buildBudgetFiscalYearKey = (input: {
  egcs_tp_fiscalyear: string
}): string => {
  return String(input.egcs_tp_fiscalyear)
}

/**
 * Builds a unique key for a transfer payment performance indicator name.
 *
 * @param input - The input object containing performance indicator name details and outcome context.
 * @param input.tempOutcomeId - Temporary outcome identifier used in wizard.
 * @param input.egcs_tp_transferpaymentoutcome - Persisted outcome identifier.
 * @param input.egcs_tp_name_en - English name of the indicator.
 * @param input.egcs_tp_name_fr - French name of the indicator.
 * @returns The generated unique key.
 */
export const buildPerformanceIndicatorNameKey = (input: {
  tempOutcomeId?: string
  egcs_tp_transferpaymentoutcome?: string
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
}): string => {
  const outcomeKey = String(input.egcs_tp_transferpaymentoutcome ?? input.tempOutcomeId ?? '')
  return [outcomeKey, normalizeTextKey(input.egcs_tp_name_en), normalizeTextKey(input.egcs_tp_name_fr)].join('|')
}
