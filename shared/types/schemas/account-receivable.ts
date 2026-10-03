import { z } from 'zod'
import { PositivePostgresBigintIdSchema as DatabaseIdSchema } from './common'
import { RequiredDateSchema } from './form-input'
import { MoneySchema, PositiveMoneySchema } from './money'
import { isCanonicalMoney, sumMoney } from '../../utils/money'

import { ACCOUNT_RECEIVABLE_TYPE_ENUM, ACCOUNT_RECEIVABLE_RECOVERY_METHOD_ENUM } from '../../constants/enums'

export { ACCOUNT_RECEIVABLE_TYPE_ENUM, ACCOUNT_RECEIVABLE_RECOVERY_METHOD_ENUM } from '../../constants/enums'
const NarrativeSchema = z.string().max(10000).default('')
const MethodSchema = z.enum(ACCOUNT_RECEIVABLE_RECOVERY_METHOD_ENUM, { error: 'validation.required' })

export const AccountReceivableCreateBaseSchema = z.object({
  egcs_fc_applicantrecipient: DatabaseIdSchema,
  egcs_fc_agencyfiscalyear: DatabaseIdSchema,
  egcs_fc_type: z.enum(ACCOUNT_RECEIVABLE_TYPE_ENUM, { error: 'validation.required' }),
  egcs_fc_recoverymethod: MethodSchema,
  egcs_fc_requesteddate: RequiredDateSchema,
  egcs_fc_narrative_en: NarrativeSchema,
  egcs_fc_narrative_fr: NarrativeSchema,
  egcs_fc_recipientpreference: MethodSchema.nullable().optional(),
  egcs_fc_preferenceoverride_en: NarrativeSchema,
  egcs_fc_preferenceoverride_fr: NarrativeSchema,
  egcs_fc_linkedreceivable: DatabaseIdSchema.optional(),
  egcs_fc_monitorfollowup: DatabaseIdSchema.optional(),
  egcs_fc_sources: z.array(z.string().regex(/^(claim|advance):[1-9]\d*$/, { error: 'validation.invalid_selection' })).max(500).optional()
}).strict()

export const AccountReceivableCreateSchema = AccountReceivableCreateBaseSchema.superRefine((input, ctx) => {
  const ids = input.egcs_fc_sources
  if (ids && ids.length !== new Set(ids).size) ctx.addIssue({ code: 'custom', path: ['egcs_fc_sources'], message: 'validation.invalid_selection' })
  if (input.egcs_fc_type === 'ineligible_expense' && !input.egcs_fc_linkedreceivable && !ids?.length) {
    ctx.addIssue({ code: 'custom', path: ['egcs_fc_sources'], message: 'validation.required' })
  }
})

export const AccountReceivableLineEditSchema = z.object({
  id: DatabaseIdSchema,
  egcs_fc_amount: MoneySchema
}).strict()

export const AccountReceivableEditSchema = z.object({
  egcs_fc_requesteddate: RequiredDateSchema,
  egcs_fc_recoverymethod: MethodSchema,
  egcs_fc_narrative_en: NarrativeSchema,
  egcs_fc_narrative_fr: NarrativeSchema,
  egcs_fc_recipientpreference: MethodSchema.nullable().optional(),
  egcs_fc_preferenceoverride_en: NarrativeSchema,
  egcs_fc_preferenceoverride_fr: NarrativeSchema,
  egcs_fc_lines: z.array(AccountReceivableLineEditSchema).min(1, { error: 'validation.required' }).max(500)
}).strict().superRefine((input, ctx) => {
  if (new Set(input.egcs_fc_lines.map(line => line.id)).size !== input.egcs_fc_lines.length) {
    ctx.addIssue({ code: 'custom', path: ['egcs_fc_lines'], message: 'validation.invalid_selection' })
  }
})

export const AccountReceivableCancelSchema = z.object({
  egcs_fc_reason: z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' }).max(10000)
}).strict()

export const AccountReceivableCreditMemoAllocationSchema = z.object({
  egcs_fc_receivableline: DatabaseIdSchema,
  egcs_fc_amount: PositiveMoneySchema
}).strict()

export const AccountReceivableCreditMemoCreateSchema = z.object({
  egcs_fc_applicantrecipient: DatabaseIdSchema,
  egcs_fc_receiveddate: RequiredDateSchema,
  egcs_fc_amount: PositiveMoneySchema,
  egcs_fc_receiptreference: z.string().trim().max(1000).nullable().optional(),
  egcs_fc_narrative_en: NarrativeSchema,
  egcs_fc_narrative_fr: NarrativeSchema,
  egcs_fc_allocations: z.array(AccountReceivableCreditMemoAllocationSchema).min(1, { error: 'validation.required' }).max(500)
}).strict().superRefine((input, ctx) => {
  const amountsAreValid = isCanonicalMoney(input.egcs_fc_amount)
    && input.egcs_fc_allocations.every(line => isCanonicalMoney(line.egcs_fc_amount))
  if (amountsAreValid && sumMoney(input.egcs_fc_allocations.map(line => line.egcs_fc_amount)) !== input.egcs_fc_amount) {
    ctx.addIssue({ code: 'custom', path: ['egcs_fc_amount'], message: 'validation.invalid_number' })
  }
  if (new Set(input.egcs_fc_allocations.map(line => line.egcs_fc_receivableline)).size !== input.egcs_fc_allocations.length) {
    ctx.addIssue({ code: 'custom', path: ['egcs_fc_allocations'], message: 'validation.invalid_selection' })
  }
})

export const AccountReceivableCreditMemoEditSchema = AccountReceivableCreditMemoCreateSchema
export type AccountReceivableCreate = z.infer<typeof AccountReceivableCreateSchema>
export type AccountReceivableEdit = z.infer<typeof AccountReceivableEditSchema>
export type AccountReceivableCreditMemoCreate = z.infer<typeof AccountReceivableCreditMemoCreateSchema>
export type AccountReceivableCreditMemoEdit = z.infer<typeof AccountReceivableCreditMemoEditSchema>
