import { expressionBuilder, type Expression, type ExpressionWrapper } from 'kysely'
import {
  isPersistableMoney,
  moneyFromMinorUnits,
  type MinorUnits,
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
 * Produces an integer minor-unit NUMERIC write expression; owning-row guards enforce denomination.
 *
 * @param value - Canonical monetary value for one persisted row.
 * @returns A numeric-valued Kysely expression.
 */
export const databaseMoneyValue = (value: Money): ExpressionWrapper<never, never, MinorUnits> => {
  if (!isPersistableMoney(value)) {
    throw new RangeError('Money exceeds the persisted amount range.')
  }
  return expressions.cast<MinorUnits>(expressions.val(value.amount), 'numeric')
}

/**
 * Validates and canonicalizes a NUMERIC value that was explicitly selected as text.
 *
 * Numeric driver output is rejected so converted paths cannot accidentally fall
 * back to the legacy global Number parser.
 *
 * @param value - Database minor units selected through `databaseMoneyText`.
 * @param currency - Currency resolved from the owning record.
 * @returns Canonical exact money.
 */
export const parseDatabaseMoney = (value: unknown, currency: string): Money => {
  if (typeof value !== 'string') {
    throw new TypeError('Database money must be selected as text.')
  }
  return moneyFromMinorUnits(value, currency)
}
