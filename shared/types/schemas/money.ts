import { z } from 'zod'
import {
  compareMoney,
  isCanonicalMoney,
  parseMoney,
  type Money
} from '../../utils/money'

const MoneyInputValueSchema = z.union([
  z.string({ error: 'validation.required' }),
  z.number({ error: 'validation.required' })
], { error: 'validation.required' })
  .refine(value => value !== '', { error: 'validation.required' })

/** Accepts exact decimal text or a safe compatibility number and emits canonical money text. */
export const MoneySchema = MoneyInputValueSchema.transform((value, ctx): Money => {
  try {
    return parseMoney(value)
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'validation.invalid_number'
    })
    return z.NEVER
  }
})

/** Validates values that are already in canonical fixed-scale money form. */
export const CanonicalMoneySchema = z.custom<Money>(isCanonicalMoney, {
  error: 'validation.invalid_number'
})

/** Exact positive money input, preserving existing positive-only domain rules. */
export const PositiveMoneySchema = MoneySchema.refine(
  value => compareMoney(value, parseMoney('0')) > 0,
  { error: 'validation.invalid_number' }
)

/** Exact nonnegative money input for domains whose rule explicitly permits zero. */
export const NonNegativeMoneySchema = MoneySchema.refine(
  value => compareMoney(value, parseMoney('0')) >= 0,
  { error: 'validation.invalid_number' }
)

/** Optional exact money input; empty form values retain the established undefined behavior. */
export const OptionalMoneySchema = z.preprocess(
  value => value === '' || value === null || value === undefined ? undefined : value,
  MoneySchema.optional()
)
