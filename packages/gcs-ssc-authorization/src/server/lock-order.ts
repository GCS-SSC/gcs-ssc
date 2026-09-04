/**
 * Returns one deterministic identifier order for authorization row locks.
 *
 * Every transaction that locks the same principals or roles must use this
 * order, regardless of which user initiated the operation.
 *
 * @param ids - Principal or role identifiers to order.
 * @returns Deduplicated identifiers in canonical lock order.
 */
export const canonicalizeAuthorizationLockIds = (
  ids: readonly string[]
): string[] => [...new Set(ids)].sort((left, right) => {
  const numericOrder = left.localeCompare(right, 'en', { numeric: true })
  if (numericOrder !== 0) return numericOrder

  // Numeric collation intentionally considers values such as 1, 01, and 001
  // equivalent. A code-unit tie-breaker makes lock ordering independent of the
  // caller's insertion order even when the collation keys are equal.
  return left < right ? -1 : left > right ? 1 : 0
})
