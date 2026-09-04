import { normalizeTextKey } from '~~/server/utils/transfer-payment-uniqueness'

/**
 * Builds a unique key for a transfer payment amendment type.
 *
 * @param input - The input object containing amendment type details.
 * @param input.egcs_tp_amended - The amendment base type.
 * @param input.egcs_tp_name_en - English name of the amendment type.
 * @param input.egcs_tp_name_fr - French name of the amendment type.
 * @returns The generated unique key.
 */
export const buildAmendmentTypeKey = (input: {
  egcs_tp_amended: string
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
}): string => {
  return [
    input.egcs_tp_amended,
    normalizeTextKey(input.egcs_tp_name_en),
    normalizeTextKey(input.egcs_tp_name_fr)
  ].join('|')
}

/**
 * Builds a unique key for a transfer payment amendment subtype.
 *
 * @param input - The input object containing amendment subtype details.
 * @param input.egcs_tp_amendedtype - The ID of the parent amendment type.
 * @param input.egcs_tp_name_en - English name of the amendment subtype.
 * @param input.egcs_tp_name_fr - French name of the amendment subtype.
 * @returns The generated unique key.
 */
export const buildAmendmentSubtypeKey = (input: {
  egcs_tp_amendedtype: string
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
}): string => {
  return [
    String(input.egcs_tp_amendedtype),
    normalizeTextKey(input.egcs_tp_name_en),
    normalizeTextKey(input.egcs_tp_name_fr)
  ].join('|')
}

/**
 * Builds a unique key for a transfer payment monitor type.
 *
 * @param input - The input object containing monitor type details.
 * @param input.egcs_tp_name_en - English name of the monitor type.
 * @param input.egcs_tp_name_fr - French name of the monitor type.
 * @returns The generated unique key.
 */
export const buildMonitorTypeKey = (input: {
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
}): string => {
  return [normalizeTextKey(input.egcs_tp_name_en), normalizeTextKey(input.egcs_tp_name_fr)].join('|')
}

/**
 * Builds a unique key for a transfer payment area of expertise.
 *
 * @param input - The input object containing area of expertise details.
 * @param input.egcs_tp_name_en - English name of the area of expertise.
 * @param input.egcs_tp_name_fr - French name of the area of expertise.
 * @returns The generated unique key.
 */
export const buildAreaOfExpertiseKey = (input: {
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
}): string => {
  return [normalizeTextKey(input.egcs_tp_name_en), normalizeTextKey(input.egcs_tp_name_fr)].join('|')
}
