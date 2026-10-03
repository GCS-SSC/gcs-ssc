import { formatMoneyText, parseMoneyText } from '~~/shared/utils/money'

/** Formats retained AR money; malformed draft values remain unavailable instead of becoming zero.
 * @param value - Exact amount entered or captured.
 * @param locale - Current interface locale.
 * @param currency - Inherited Agreement denomination.
 * @returns Localized amount or null for incomplete input.
 */
export const formatAccountReceivableAmount = (value: string | null | undefined, locale: string, currency: string): string | null => {
  if (value === null || value === undefined || value === '') return null
  try {
    return formatMoneyText(parseMoneyText(value), locale, currency)
  } catch {
    return null
  }
}

/** Creates the business reference from retained Agreement numbering.
 * @param record - Captured numbering fields.
 * @param record.egcs_fc_agreementnumber - Agreement business reference.
 * @param record.egcs_fc_number - Independent case sequence.
 * @returns A stable business reference.
 */
export const accountReceivableReference = (record: { egcs_fc_agreementnumber: string, egcs_fc_number: number }): string =>
  `${record.egcs_fc_agreementnumber} / AR ${record.egcs_fc_number}`
