import { compareMoney, isCanonicalMoney, parseMoney } from '~~/shared/utils/money'

const ZERO_MONEY = parseMoney('0')

/**
 * Whether a payment has a positive credit memo deduction to present.
 * @param value - Captured or live payment offset amount.
 * @returns True only for a valid positive monetary amount.
 */
export const hasPaymentOffset = (value: unknown): boolean => isCanonicalMoney(value)
  && compareMoney(value, ZERO_MONEY) > 0
