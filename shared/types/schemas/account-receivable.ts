import { z } from 'zod'
import { PositivePostgresBigintIdSchema as DatabaseIdSchema } from './common'
import { RequiredDateSchema } from './form-input'
import { MoneySchema, PositiveMoneySchema } from './money'
import { isCanonicalMoney, moneyToCents, sumMoney } from '../../utils/money'

import { ACCOUNT_RECEIVABLE_RECOVERY_METHOD_ENUM } from '../../constants/enums'

export { ACCOUNT_RECEIVABLE_RECOVERY_METHOD_ENUM } from '../../constants/enums'
const NarrativeSchema = z.string().max(10000).default('')
const MethodSchema = z.enum(ACCOUNT_RECEIVABLE_RECOVERY_METHOD_ENUM, { error: 'validation.required' })

export const AccountReceivableCreateBaseSchema = z.object({
  egcs_fc_applicantrecipient: DatabaseIdSchema,
  egcs_fc_agencyfiscalyear: DatabaseIdSchema,
  egcs_fc_type: DatabaseIdSchema,
  egcs_fc_recoverymethod: MethodSchema.nullable().default(null),
  egcs_fc_requesteddate: RequiredDateSchema,
  egcs_fc_narrative_en: NarrativeSchema,
  egcs_fc_narrative_fr: NarrativeSchema,
  egcs_fc_recipientpreference: MethodSchema.nullable().optional(),
  egcs_fc_preferenceoverride_en: NarrativeSchema,
  egcs_fc_preferenceoverride_fr: NarrativeSchema,
  egcs_fc_linkedreceivable: DatabaseIdSchema.optional(),
  egcs_fc_sourcepayment: DatabaseIdSchema.optional(),
  egcs_fc_sourceclaim: DatabaseIdSchema.optional(),
  egcs_fc_monitorfollowup: DatabaseIdSchema.nullable().optional(),
  egcs_fc_sources: z.array(z.string().regex(/^(claim|advance):[1-9]\d*$/, { error: 'validation.invalid_selection' })).max(500).optional()
}).strict()

export const AccountReceivableCreateSchema = AccountReceivableCreateBaseSchema.superRefine((input, ctx) => {
  if ((input.egcs_fc_sourcepayment && input.egcs_fc_sourceclaim)
    || (input.egcs_fc_linkedreceivable && (input.egcs_fc_sourcepayment || input.egcs_fc_sourceclaim))) {
    ctx.addIssue({ code: 'custom', path: ['egcs_fc_sourcepayment'], message: 'validation.invalid_selection' })
  }
  const ids = input.egcs_fc_sources
  if (ids && ids.length !== new Set(ids).size) ctx.addIssue({ code: 'custom', path: ['egcs_fc_sources'], message: 'validation.invalid_selection' })
})

/**
 * Applies selected Agency type requirements to the authoring form; the server resolves the type independently.
 * @param type Selected Agency definition, or null before selection.
 * @returns Create schema with the selected Monitor and Claim selection requirements.
 */
export const createAccountReceivableCreateSchemaForType = (type: {
  egcs_ay_monitorrequired: boolean
  egcs_ay_claimrelated: boolean
} | null) => AccountReceivableCreateSchema.superRefine((input, ctx) => {
  if (!type) return
  if (type.egcs_ay_monitorrequired && !input.egcs_fc_monitorfollowup) {
    ctx.addIssue({ code: 'custom', path: ['egcs_fc_monitorfollowup'], message: 'validation.required' })
  }
  if (!type.egcs_ay_monitorrequired && input.egcs_fc_monitorfollowup) {
    ctx.addIssue({ code: 'custom', path: ['egcs_fc_monitorfollowup'], message: 'validation.invalid_selection' })
  }
  if (type.egcs_ay_claimrelated && !input.egcs_fc_linkedreceivable && !input.egcs_fc_sources?.length) {
    ctx.addIssue({ code: 'custom', path: ['egcs_fc_sources'], message: 'validation.required' })
  }
})

export const AccountReceivableLineEditSchema = z.object({
  id: DatabaseIdSchema,
  egcs_fc_amount: MoneySchema,
  egcs_fc_accountreceivablechartofaccount: DatabaseIdSchema.nullable().default(null)
}).strict().superRefine((input, ctx) => {
  if (isCanonicalMoney(input.egcs_fc_amount) && moneyToCents(input.egcs_fc_amount) !== BigInt(0)
    && !input.egcs_fc_accountreceivablechartofaccount) {
    ctx.addIssue({ code: 'custom', path: ['egcs_fc_accountreceivablechartofaccount'], message: 'validation.required' })
  }
})

export const AccountReceivableEditSchema = z.object({
  egcs_fc_requesteddate: RequiredDateSchema,
  egcs_fc_recoverymethod: MethodSchema.nullable().default(null),
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
