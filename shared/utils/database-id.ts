/** Largest positive value accepted by a PostgreSQL signed bigint column. */
export const MAX_POSTGRES_BIGINT_TEXT = '9223372036854775807'

/** Absolute value of the smallest value accepted by a PostgreSQL signed bigint column. */
export const MIN_POSTGRES_BIGINT_ABSOLUTE_TEXT = '9223372036854775808'

const isWithinDecimalTextBound = (value: string, bound: string): boolean =>
  value.length < bound.length || (value.length === bound.length && value <= bound)

/**
 * Checks the canonical positive decimal text representation of a PostgreSQL bigint ID.
 *
 * @param value Text to validate.
 * @returns Whether the text is within the positive signed-bigint range.
 */
export const isPositivePostgresBigintText = (value: string): boolean =>
  /^[1-9]\d*$/.test(value)
  && isWithinDecimalTextBound(value, MAX_POSTGRES_BIGINT_TEXT)

/**
 * Checks a canonical decimal text representation against PostgreSQL's signed bigint range.
 *
 * This deliberately preserves zero and signed values for fields whose business semantics have
 * not been decided. It rejects plus signs, leading zeroes, negative zero, and overflow.
 *
 * @param value Text to validate.
 * @returns Whether the text is a canonical signed-bigint value.
 */
export const isCanonicalPostgresBigintText = (value: string): boolean => {
  if (value === '0') return true
  if (/^[1-9]\d*$/.test(value)) return isWithinDecimalTextBound(value, MAX_POSTGRES_BIGINT_TEXT)
  if (!/^-[1-9]\d*$/.test(value)) return false

  return isWithinDecimalTextBound(value.slice(1), MIN_POSTGRES_BIGINT_ABSOLUTE_TEXT)
}

/**
 * Checks a canonical non-negative decimal text representation against PostgreSQL's bigint range.
 *
 * @param value Text to validate.
 * @returns Whether the text is zero or a positive signed-bigint value.
 */
export const isCanonicalNonNegativePostgresBigintText = (value: string): boolean =>
  value === '0' || isPositivePostgresBigintText(value)
