import { expressionBuilder, type Expression, type ExpressionWrapper } from 'kysely'
import {
  isNumeric19Money,
  parseMoneyText,
  type Money
} from '~~/shared/utils/money'

const expressions = expressionBuilder<never>()

/**
 * Casts a PostgreSQL/PGlite NUMERIC expression to exact text before a driver parser can coerce it.
 *
 * The returned string must be passed through `parseDatabaseMoney` before it is
 * exposed through an API or used in arithmetic.
 *
 * @param expression - Kysely numeric expression or column reference.
 * @returns A text-valued SQL expression.
 */
export const databaseMoneyText = (expression: Expression<unknown>): ExpressionWrapper<never, never, string> =>
  expressions.cast<string>(expression, 'text')

/**
 * Produces a numeric(19,2) write expression from exact canonical money.
 *
 * @param value - Canonical monetary value for one persisted row.
 * @returns A numeric-valued Kysely expression.
 */
export const databaseMoneyValue = (value: Money): ExpressionWrapper<never, never, number> => {
  if (!isNumeric19Money(value)) {
    throw new RangeError('Money exceeds PostgreSQL numeric(19,2).')
  }
  return expressions.cast<number>(expressions.val(value), 'numeric(19, 2)')
}

/**
 * Validates and canonicalizes a NUMERIC value that was explicitly selected as text.
 *
 * Numeric driver output is rejected so converted paths cannot accidentally fall
 * back to the legacy global Number parser.
 *
 * @param value - Database value selected through `databaseMoneyText`.
 * @returns Canonical exact money.
 */
export const parseDatabaseMoney = (value: unknown): Money => {
  if (typeof value !== 'string') {
    throw new TypeError('Database money must be selected as text.')
  }
  return parseMoneyText(value)
}
