/** Exact, canonical monetary text with two fractional decimal digits. */
declare const moneyBrand: unique symbol
export type Money = string & { readonly [moneyBrand]: 'Money' }

/** Exact, canonical decimal text without exponent notation. */
declare const decimalTextBrand: unique symbol
export type DecimalText = string & { readonly [decimalTextBrand]: 'DecimalText' }

const MONEY_INPUT_PATTERN = /^(-?)(0|[1-9]\d*)(?:\.(\d{1,2}))?$/
const CANONICAL_MONEY_PATTERN = /^-?(?:0|[1-9]\d*)\.\d{2}$/
const DECIMAL_TEXT_PATTERN = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/
const CENTS_PER_UNIT = BigInt(100)
const MAX_SAFE_NUMBER_CENTS = BigInt(Number.MAX_SAFE_INTEGER)

/** Largest absolute value accepted by a PostgreSQL `numeric(19,2)` money column, in cents. */
export const NUMERIC_19_2_MAX_CENTS = BigInt('9999999999999999999')

/** Largest positive canonical value accepted by a PostgreSQL `numeric(19,2)` money column. */
export const NUMERIC_19_2_MAX_MONEY = '99999999999999999.99' as Money

/**
 * Converts integer cents to canonical fixed-scale monetary text.
 *
 * This operation intentionally has no `numeric(19,2)` limit because exact
 * aggregates can be larger than any individual persisted row.
 *
 * @param cents - Signed integer number of cents.
 * @returns Canonical fixed-scale monetary text.
 */
export const moneyFromCents = (cents: bigint): Money => {
  const negative = cents < BigInt(0)
  const absoluteCents = negative ? -cents : cents
  const units = absoluteCents / CENTS_PER_UNIT
  const fraction = String(absoluteCents % CENTS_PER_UNIT).padStart(2, '0')
  const sign = negative && absoluteCents !== BigInt(0) ? '-' : ''
  return `${sign}${units}.${fraction}` as Money
}

/**
 * Reads canonical monetary text as signed integer cents.
 *
 * @param value - Canonical monetary value.
 * @returns Exact signed integer number of cents.
 */
export const moneyToCents = (value: Money): bigint => {
  if (value === '-0.00' || !CANONICAL_MONEY_PATTERN.test(value)) {
    throw new TypeError('Money must be canonical fixed-scale decimal text.')
  }

  const negative = value.startsWith('-')
  const unsigned = negative ? value.slice(1) : value
  const [units, fraction] = unsigned.split('.') as [string, string]
  const cents = BigInt(units) * CENTS_PER_UNIT + BigInt(fraction)
  return negative ? -cents : cents
}

/**
 * Whether a canonical value can be persisted in a PostgreSQL `numeric(19,2)` column.
 *
 * @param value - Canonical monetary value.
 * @returns True when the value fits the declared database precision and scale.
 */
export const isNumeric19Money = (value: Money): boolean => {
  const cents = moneyToCents(value)
  return cents >= -NUMERIC_19_2_MAX_CENTS && cents <= NUMERIC_19_2_MAX_CENTS
}

/**
 * Canonicalizes exact decimal money text without applying a database-row range.
 *
 * This parser is appropriate for database aggregates and immutable API evidence,
 * whose exact totals can exceed one `numeric(19,2)` row. Request fields backed by
 * that column must use `parseMoney` instead.
 *
 * @param value - Exact decimal text with at most two fractional digits.
 * @returns Canonical fixed-scale monetary text.
 */
export const parseMoneyText = (value: string): Money => {
  const match = MONEY_INPUT_PATTERN.exec(value)
  if (!match) {
    throw new TypeError('Money must use canonical decimal notation with at most two fractional digits.')
  }

  const units = match[2]
  if (units === undefined) {
    throw new TypeError('Money must contain decimal units.')
  }
  const fraction = (match[3] ?? '').padEnd(2, '0')
  const unsignedCents = BigInt(units) * CENTS_PER_UNIT + BigInt(fraction)
  const cents = match[1] === '-' ? -unsignedCents : unsignedCents
  return moneyFromCents(cents)
}

/**
 * Canonicalizes one persisted-row money input without using binary floating-point arithmetic.
 *
 * Strings are the authoritative HTTP/database transport and support the full
 * PostgreSQL `numeric(19,2)` range. Numbers are a compatibility input only and
 * are accepted when their serialized decimal cents fit `Number.MAX_SAFE_INTEGER`.
 * Exponent notation, leading zeroes, whitespace, and excess scale are rejected.
 *
 * @param value - Decimal string or compatibility number input.
 * @returns Canonical fixed-scale monetary text.
 */
export const parseMoney = (value: string | number): Money => {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('Money must be finite decimal text or a finite number.')
  }

  const money = parseMoneyText(typeof value === 'number' ? String(value) : value)
  const cents = moneyToCents(money)
  const unsignedCents = cents < BigInt(0) ? -cents : cents

  if (unsignedCents > NUMERIC_19_2_MAX_CENTS) {
    throw new RangeError('Money exceeds PostgreSQL numeric(19,2).')
  }
  if (typeof value === 'number' && unsignedCents > MAX_SAFE_NUMBER_CENTS) {
    throw new RangeError('Numeric money input exceeds the exact compatibility range; send decimal text instead.')
  }

  return money
}

/**
 * Whether a value is already canonical fixed-scale monetary text.
 *
 * @param value - Unknown value.
 * @returns True when the value is canonical, including an aggregate beyond one row's range.
 */
export const isCanonicalMoney = (value: unknown): value is Money => typeof value === 'string'
  && value !== '-0.00'
  && CANONICAL_MONEY_PATTERN.test(value)

/**
 * Canonicalizes exact decimal text without applying money scale or range rules.
 *
 * @param value - Plain decimal text returned by a database or accepted by a decimal-specific API.
 * @returns Canonical decimal text with insignificant trailing zeroes removed.
 */
export const parseDecimalText = (value: string): DecimalText => {
  const match = DECIMAL_TEXT_PATTERN.exec(value)
  if (!match) {
    throw new TypeError('Decimal text must use canonical non-exponent notation.')
  }

  const fraction = (match[3] ?? '').replace(/0+$/, '')
  const isZero = match[2] === '0' && fraction.length === 0
  const sign = match[1] === '-' && !isZero ? '-' : ''
  return `${sign}${match[2]}${fraction.length > 0 ? `.${fraction}` : ''}` as DecimalText
}

/**
 * Adds two monetary values exactly.
 *
 * @param left - Left operand.
 * @param right - Right operand.
 * @returns Exact sum.
 */
export const addMoney = (left: Money, right: Money): Money => moneyFromCents(
  moneyToCents(left) + moneyToCents(right)
)

/**
 * Subtracts the right monetary value from the left exactly.
 *
 * @param left - Left operand.
 * @param right - Right operand.
 * @returns Exact difference.
 */
export const subtractMoney = (left: Money, right: Money): Money => moneyFromCents(
  moneyToCents(left) - moneyToCents(right)
)

/**
 * Sums monetary values exactly, including aggregates beyond one database row's range.
 *
 * @param values - Monetary values to add.
 * @returns Exact sum.
 */
export const sumMoney = (values: Iterable<Money>): Money => {
  let total = BigInt(0)
  for (const value of values) total += moneyToCents(value)
  return moneyFromCents(total)
}

/**
 * Compares two monetary values exactly.
 *
 * @param left - Left operand.
 * @param right - Right operand.
 * @returns Negative one, zero, or one according to exact cent ordering.
 */
export const compareMoney = (left: Money, right: Money): -1 | 0 | 1 => {
  const leftCents = moneyToCents(left)
  const rightCents = moneyToCents(right)
  if (leftCents < rightCents) return -1
  if (leftCents > rightCents) return 1
  return 0
}

/**
 * Converts money for presentation-only APIs that require a JavaScript number.
 *
 * The conversion fails unless converting the number back to cents produces the
 * exact same monetary value. Returned numbers must never be used for business
 * arithmetic, comparisons, persistence, hashing, or API transport.
 *
 * @param value - Canonical monetary value.
 * @returns A presentation-safe JavaScript number.
 */
export const moneyToPresentationNumber = (value: Money): number => {
  const cents = moneyToCents(value)
  if (cents < -MAX_SAFE_NUMBER_CENTS || cents > MAX_SAFE_NUMBER_CENTS) {
    throw new RangeError('Money exceeds the presentation-number range.')
  }

  const numberValue = Number(value)
  if (
    !Number.isFinite(numberValue)
    || moneyToCents(parseMoneyText(numberValue.toFixed(2))) !== cents
  ) {
    throw new RangeError('Money cannot round-trip through a presentation number without changing a cent.')
  }
  return numberValue
}

/**
 * Formats exact money without converting its authoritative value to a JavaScript number.
 *
 * @param value - Canonical monetary value.
 * @param locale - Locale understood by `Intl.NumberFormat`.
 * @param currency - ISO 4217 currency code.
 * @returns Localized currency text with the exact cents preserved.
 */
export const formatMoneyText = (value: Money, locale: string, currency: string): string => {
  const cents = moneyToCents(value)
  const negative = cents < BigInt(0)
  const absoluteCents = negative ? -cents : cents
  const units = absoluteCents / CENTS_PER_UNIT
  const fraction = String(absoluteCents % CENTS_PER_UNIT).padStart(2, '0')
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
  const formattedValue: number | bigint = negative
    ? (units === BigInt(0) ? -0 : -units)
    : units

  return formatter.formatToParts(formattedValue)
    .map(part => part.type === 'fraction' ? fraction : part.value)
    .join('')
}
