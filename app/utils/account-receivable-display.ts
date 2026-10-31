import { formatMoneyText, parseMoney, type Money } from '~~/shared/utils/money'

/** Formats retained AR money; malformed draft values remain unavailable instead of becoming zero.
 * @param value - Exact amount entered or captured.
 * @param locale - Current interface locale.
 * @returns Localized amount or null for incomplete input.
 */
export const formatAccountReceivableAmount = (value: Money | null | undefined, locale: string): string | null => {
  if (value === null || value === undefined) return null
  try {
    return formatMoneyText(parseMoney(value), locale)
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
