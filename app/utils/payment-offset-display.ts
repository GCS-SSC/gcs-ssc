import { compareMoney, isCanonicalMoney, zeroMoney } from '~~/shared/utils/money'

/**
 * Whether a payment has a positive credit memo deduction to present.
 * @param value - Captured or live payment offset amount.
 * @returns True only for a valid positive monetary amount.
 */
export const hasPaymentOffset = (value: unknown): boolean => isCanonicalMoney(value)
  && compareMoney(value, zeroMoney(value.currency)) > 0
