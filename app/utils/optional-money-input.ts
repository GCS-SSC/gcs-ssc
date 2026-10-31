import { parseMoney } from '~~/shared/utils/money'
import type { Money, MoneyInput } from '~~/shared/utils/money'

/**
 * Serializes an optional amount without treating blank input as malformed money.
 * @param value Current currency-control value.
 * @returns Canonical money, or null for the established empty API representation.
 */
export const parseOptionalMoneyInput = (value: MoneyInput): Money | null =>
  value === undefined || value === null ? null : parseMoney(value)
