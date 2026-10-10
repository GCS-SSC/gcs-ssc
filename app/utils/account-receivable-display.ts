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

/** Presents the regular record identity for receivables and adjustments.
 * @param record - Receivable or adjustment identity.
 * @param record.id - Canonical entity ID.
 * @returns The numeric record ID.
 */
export const accountReceivableReference = (record: { id: string }): string => record.id
