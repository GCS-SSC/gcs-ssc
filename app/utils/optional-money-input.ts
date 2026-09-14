import { parseMoney } from '~~/shared/utils/money'
import type { Money } from '~~/shared/utils/money'

/**
 * Serializes an optional amount without treating blank input as malformed money.
 * @param value Current text-control value.
 * @returns Canonical money, or null for the established empty API representation.
 */
export const parseOptionalMoneyInput = (value: string | null | undefined): Money | null =>
  value === '' || value === null || value === undefined ? null : parseMoney(value)
