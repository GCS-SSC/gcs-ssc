/** Largest decimal value whose declared fractional units can be represented safely by JavaScript. */
const MAX_SAFE_DECIMAL_UNITS = BigInt(Number.MAX_SAFE_INTEGER)

/** Conservative supported maximum for persisted monetary request values (90 trillion). */
export const MAX_SAFE_MONEY = 90_000_000_000_000

/**
 * Converts a PostgreSQL NUMERIC string without silently discarding declared decimal precision.
 *
 * @param value - Decimal text returned by the database driver.
 * @returns A number when every declared decimal unit fits JavaScript's safe integer range.
 */
export const parseSafeDecimal = (value: string): number => {
  const normalized = value.trim()
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(normalized)
  if (!match) {
    throw new TypeError(`Invalid database numeric value: ${value}`)
  }

  // PostgreSQL preserves a column's declared scale in returned text. Trailing
  // fractional zeroes do not add information and must not make an otherwise
  // safe integer (for example 10000000000.0000000000) look unsafe.
  const significantFraction = (match[3] ?? '').replace(/0+$/, '')
  const units = BigInt(`${match[2]}${significantFraction}`)
  if (units > MAX_SAFE_DECIMAL_UNITS) {
    throw new RangeError('Database numeric value exceeds JavaScript safe decimal precision.')
  }

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) {
    throw new RangeError('Database numeric value is not finite.')
  }
  return parsed
}

/**
 * Whether a request value fits the supported two-decimal monetary contract.
 *
 * @param value - Coerced monetary request value.
 * @returns True when the value is finite, bounded, and has at most two decimal places.
 */
export const isSafeMoney = (value: number): boolean => Number.isFinite(value)
  && Math.abs(value) <= MAX_SAFE_MONEY
  && Number.isSafeInteger(Math.round(value * 100))
  && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7

/**
 * Whether a JavaScript number can be stored by a PostgreSQL `numeric(precision, scale)` column
 * without rounding or overflowing the declared precision.
 *
 * @param value - Coerced request or derived numeric value.
 * @param precision - Total number of decimal digits supported by the column.
 * @param scale - Number of fractional decimal digits supported by the column.
 * @returns True when the value is finite, within the column range, and has no excess scale.
 */
export const isRepresentableByNumeric = (value: number, precision: number, scale: number): boolean => {
  if (
    !Number.isFinite(value)
    || !Number.isInteger(precision)
    || !Number.isInteger(scale)
    || precision <= 0
    || scale < 0
    || scale > precision
  ) {
    return false
  }

  const scaleFactor = 10 ** scale
  const scaledValue = value * scaleFactor
  const roundedUnits = Math.round(scaledValue)
  if (!Number.isSafeInteger(roundedUnits)) return false

  const floatingPointTolerance = Number.EPSILON * Math.max(1, Math.abs(scaledValue)) * 4
  if (Math.abs(scaledValue - roundedUnits) > floatingPointTolerance) return false

  const maxUnits = BigInt('9'.repeat(precision))
  return BigInt(Math.abs(roundedUnits)) <= maxUnits
}
