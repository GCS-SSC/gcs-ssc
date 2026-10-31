import { parseSafeDecimal } from '~~/shared/utils/decimal'

/**
 * Projects a catalog percentage into its nonmonetary API number representation.
 * @param row - Selected Agency cost-line fields.
 * @returns The same fields with the nullable percentage converted explicitly.
 */
export const projectAgencyCostLineItem = <T extends { egcs_ay_percentage: string | null }>(row: T) => {
  const { egcs_ay_percentage: percentage, ...fields } = row
  return {
    ...fields,
    egcs_ay_percentage: percentage === null ? null : parseSafeDecimal(String(percentage))
  }
}

/**
 * Projects a Stream cost-sharing ratio into its nonmonetary API number representation.
 * @param row - Selected Stream cost-line fields.
 * @returns The same fields with the ratio converted explicitly.
 */
export const projectStreamCostLineItem = <T extends { egcs_tp_costsharingratio: string }>(row: T) => {
  const { egcs_tp_costsharingratio: ratio, ...fields } = row
  return { ...fields, egcs_tp_costsharingratio: parseSafeDecimal(String(ratio)) }
}
