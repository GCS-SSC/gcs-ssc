import { z } from 'zod'
import { RequiredDateSchema } from './form-input'
import { MoneySchema } from './money'
import { PositivePostgresBigintIdSchema as DatabaseIdSchema } from './common'

export const CorrectionCreateSchema = z.object({
  egcs_fc_commitment: DatabaseIdSchema,
  egcs_fc_payments: z.array(DatabaseIdSchema).min(1, { error: 'validation.required' }).max(500, { error: 'validation.array_too_long' }).meta({ formRequired: true }),
  egcs_fc_requesteddate: RequiredDateSchema,
  egcs_fc_narrative_en: z.string().max(10000, { error: 'validation.string_too_long' }).default(''),
  egcs_fc_narrative_fr: z.string().max(10000, { error: 'validation.string_too_long' }).default(''),
  egcs_fc_linkedcorrection: DatabaseIdSchema.optional()
}).strict().superRefine((input, ctx) => {
  if (new Set(input.egcs_fc_payments).size !== input.egcs_fc_payments.length) {
    ctx.addIssue({ code: 'custom', path: ['egcs_fc_payments'], message: 'validation.invalid_selection' })
  }
})

export const CorrectionLineEditSchema = z.object({
  egcs_fc_commitmentline: DatabaseIdSchema,
  egcs_fc_adjustment: MoneySchema
}).strict()

export const CorrectionEditSchema = z.object({
  egcs_fc_requesteddate: RequiredDateSchema,
  egcs_fc_narrative_en: z.string().max(10000, { error: 'validation.string_too_long' }).default(''),
  egcs_fc_narrative_fr: z.string().max(10000, { error: 'validation.string_too_long' }).default(''),
  egcs_fc_lines: z.array(CorrectionLineEditSchema).min(1, { error: 'validation.required' }).max(500, { error: 'validation.array_too_long' })
}).strict()

export const CorrectionCancelSchema = z.object({
  egcs_fc_reason: z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' }).max(10000, { error: 'validation.string_too_long' })
}).strict()

export type CorrectionCreate = z.infer<typeof CorrectionCreateSchema>
export type CorrectionEdit = z.infer<typeof CorrectionEditSchema>
