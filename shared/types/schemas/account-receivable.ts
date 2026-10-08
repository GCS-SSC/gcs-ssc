import { z } from 'zod'
import { PositivePostgresBigintIdSchema as DatabaseIdSchema } from './common'
import { RequiredDateSchema } from './form-input'
import { MoneySchema, PositiveMoneySchema } from './money'
import { isCanonicalMoney, moneyToCents } from '../../utils/money'

import { ACCOUNT_RECEIVABLE_RECOVERY_METHOD_ENUM, CURRENCY_CODES_ENUM } from '../../constants/enums'

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

export const AccountReceivableCreditMemoCreateSchema = z.object({
  egcs_fc_receivable: DatabaseIdSchema,
  egcs_fc_agency: DatabaseIdSchema,
  egcs_fc_applicantrecipient: DatabaseIdSchema,
  egcs_fc_currency: z.enum(CURRENCY_CODES_ENUM, { error: 'validation.required' }),
  egcs_fc_receiveddate: RequiredDateSchema,
  egcs_fc_reason: z.string().max(10000).default('')
}).strict()

export const AccountReceivableCreditMemoEditSchema = AccountReceivableCreditMemoCreateSchema
export type AccountReceivableCreate = z.infer<typeof AccountReceivableCreateSchema>
export type AccountReceivableEdit = z.infer<typeof AccountReceivableEditSchema>
export type AccountReceivableCreditMemoCreate = z.infer<typeof AccountReceivableCreditMemoCreateSchema>
export type AccountReceivableCreditMemoEdit = z.infer<typeof AccountReceivableCreditMemoEditSchema>

export const AccountReceivableCreditMemoLineCreateSchema = z.object({
  egcs_fc_linenumber: z.number({ error: 'validation.required' }).int({ error: 'validation.invalid_number' }).min(1, { error: 'validation.invalid_number' }).max(32767, { error: 'validation.invalid_number' }),
  egcs_fc_creditmemochartofaccount: DatabaseIdSchema,
  egcs_fc_amount: PositiveMoneySchema
}).strict()
export const AccountReceivableCreditMemoLineEditSchema = AccountReceivableCreditMemoLineCreateSchema
export type AccountReceivableCreditMemoLineCreate = z.infer<typeof AccountReceivableCreditMemoLineCreateSchema>
export type AccountReceivableCreditMemoLineEdit = z.infer<typeof AccountReceivableCreditMemoLineEditSchema>

export const AccountReceivableSummaryEditSchema = z.object(AccountReceivableEditSchema.shape).omit({ egcs_fc_lines: true }).strict()
export const AccountReceivableLinePatchSchema = z.object({
  egcs_fc_amount: MoneySchema,
  egcs_fc_accountreceivablechartofaccount: DatabaseIdSchema.nullable().default(null)
}).strict().superRefine((input, ctx) => {
  if (isCanonicalMoney(input.egcs_fc_amount) && moneyToCents(input.egcs_fc_amount) !== BigInt(0) && !input.egcs_fc_accountreceivablechartofaccount) {
    ctx.addIssue({ code: 'custom', path: ['egcs_fc_accountreceivablechartofaccount'], message: 'validation.required' })
  }
})
export const AccountReceivableLineCreateSchema = AccountReceivableLinePatchSchema.safeExtend({
  egcs_fc_originalline: DatabaseIdSchema.optional(),
  egcs_fc_sourcekey: z.string({ error: 'validation.required' }).regex(/^(claim|advance):[1-9]\d*$/, { error: 'validation.invalid_selection' }).meta({ formRequired: true })
})
export type AccountReceivableLineCreate = z.infer<typeof AccountReceivableLineCreateSchema>
export type AccountReceivableLinePatch = z.infer<typeof AccountReceivableLinePatchSchema>
export type AccountReceivableSummaryEdit = z.infer<typeof AccountReceivableSummaryEditSchema>
