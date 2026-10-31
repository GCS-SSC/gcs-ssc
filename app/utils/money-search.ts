import { compareMoney, formatMoneyText, majorMoneyText, parseCurrencyMoney, type Money } from '~~/shared/utils/money'

/**
 * Matches human amount text without exposing integer minor-unit storage to searches.
 * @param value Exact amount from the API.
 * @param search Table search text.
 * @param locale Current display locale.
 * @returns Whether major-unit text, localized display or the exact entered amount matches.
 */
export const moneyMatchesSearch = (value: Money, search: string, locale: string): boolean => {
  /**
   * @param text Human search or display text.
   * @returns Comparable localized text.
   */
  const normalize = (text: string) => text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase(locale)
  const query = normalize(search)
  if (normalize(majorMoneyText(value)).includes(query)) return true
  if (!/^-?\d+$/.test(query)) {
    const display = normalize(formatMoneyText(value, locale))
    if (display.includes(query)) return true
    const group = new Intl.NumberFormat(locale).formatToParts(1000).find(part => part.type === 'group')?.value
    if (group) {
      const separator = group.normalize('NFKC').replace(/\s+/g, ' ')
      if (display.split(separator).join('').includes(query.split(separator).join(''))) return true
    }
  }
  try {
    return compareMoney(value, parseCurrencyMoney(search, value.currency)) === 0
  } catch {
    return false
  }
}
