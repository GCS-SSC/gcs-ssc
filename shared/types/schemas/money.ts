import { z } from 'zod'
import {
  isCanonicalMoney,
  isPersistableMoney,
  parseDecimalText,
  parseMoney,
  type DecimalText,
  type Money
} from '../../utils/money'

/** Currency-bearing integer minor units accepted at a persisted monetary boundary. */
export const MoneySchema = z.custom<Money>(isCanonicalMoney, {
  error: issue => issue.input === undefined || issue.input === null ? 'validation.required' : 'validation.invalid_number'
}).transform(value => parseMoney(value)).refine(isPersistableMoney, { error: 'validation.invalid_number' }).meta({ formRequired: true })

/** Exact retained or derived money, including totals larger than one persisted row. */
export const CanonicalMoneySchema = z.custom<Money>(isCanonicalMoney, {
  error: 'validation.invalid_number'
}).transform(value => parseMoney(value)).meta({ formRequired: true })

/** Positive integer minor units in the amount's explicit currency. */
export const PositiveMoneySchema = MoneySchema.refine(
  value => value.amount !== '0' && !value.amount.startsWith('-'),
  { error: 'validation.invalid_number' }
)

/** Nonnegative integer minor units in the amount's explicit currency. */
export const NonNegativeMoneySchema = MoneySchema.refine(
  value => !value.amount.startsWith('-'),
  { error: 'validation.invalid_number' }
)

/** An explicit blank clears optional money; invalid draft objects still fail validation. */
export const OptionalMoneySchema = z.preprocess(
  value => value === null ? undefined : value,
  MoneySchema.optional()
).meta({ formRequired: false })

/** Denomination-neutral major-unit settings are decimals, not monetary values. */
export const NonNegativeDecimalAmountSchema = z.string({ error: 'validation.required' })
  .min(1, { error: 'validation.required' })
  .max(128, { error: 'validation.invalid_number' })
  .transform((value, ctx): DecimalText => {
    try {
      const decimal = parseDecimalText(value)
      if (decimal.startsWith('-')) throw new TypeError('A nonnegative decimal is required.')
      return decimal
    } catch {
      ctx.addIssue({ code: 'custom', message: 'validation.invalid_number' })
      return z.NEVER
    }
  }).meta({ formRequired: true })

/**
 * Checks a supplied amount against the independently selected or resolved denomination.
 * @param value Monetary input already validated by MoneySchema.
 * @param currency Owning record's currency, when supplied by the enclosing schema.
 * @param context Current localized schema refinement.
 * @param path Monetary field path in the enclosing input.
 */
export const validateMoneyCurrency = (
  value: Money | undefined,
  currency: string | undefined,
  context: z.RefinementCtx,
  path: (string | number)[]
): void => {
  if (value !== undefined && currency !== undefined && value.currency !== currency.toUpperCase()) {
    context.addIssue({ code: 'custom', message: 'validation.invalid_selection', path })
  }
}
