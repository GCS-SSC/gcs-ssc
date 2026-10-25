import { z } from 'zod'
import { PositivePostgresBigintIdSchema } from './common'

export const FieldTooltipBaseSchema = z.strictObject({
  egcs_ay_targetkey: z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' }).max(500, { error: 'validation.max_length' }),
  egcs_ay_text_en: z.string({ error: 'validation.required' }).trim().max(4000, { error: 'validation.max_length' }),
  egcs_ay_text_fr: z.string({ error: 'validation.required' }).trim().max(4000, { error: 'validation.max_length' }),
  egcs_ay_enabled: z.boolean({ error: 'validation.required' })
})
export const FieldTooltipSaveSchema = FieldTooltipBaseSchema.superRefine((value, ctx) => {
  if (!value.egcs_ay_enabled) return
  for (const field of ['egcs_ay_text_en', 'egcs_ay_text_fr'] as const) {
    if (!value[field]) ctx.addIssue({ code: 'custom', path: [field], message: 'validation.required' })
  }
})
export type FieldTooltipSave = z.infer<typeof FieldTooltipSaveSchema>
export const FieldTooltipRuntimeQuerySchema = z.strictObject({
  entityType: z.enum(['agreement_create', 'funding_case_intake_create', 'agreement', 'review', 'funding_case_intake', 'journal_voucher', 'recommendation', 'data_collection', 'fundingcaseamendment', 'fundingcaseforecast', 'fundingcaseagreementclaim', 'fundingclaimreconcile', 'fundingcasepayment', 'fundingcaseagreementcommitment', 'fundingcasemonitor', 'fundingcaseagreementcloseout', 'fundingcasecorrection', 'fundingcaseaccountreceivable']),
  entityId: PositivePostgresBigintIdSchema
})

export interface FieldTooltipItem {
  id: string
  egcs_ay_agency: string
  egcs_ay_targetkey: string
  egcs_ay_text_en: string
  egcs_ay_text_fr: string
  egcs_ay_enabled: boolean
  egcs_ay_label_en: string
  egcs_ay_label_fr: string
  egcs_ay_screen_en: string
  egcs_ay_screen_fr: string
  egcs_ay_extension: string | null
  availability: 'available' | 'unavailable' | 'extension_disabled'
}
export interface FieldTooltipList {
  items: FieldTooltipItem[]
  targets: import('~~/shared/ui-targets/types').UiTarget[]
  capabilities: { canCreate: boolean; canEdit: boolean; canDelete: boolean }
}

export type FieldTooltipResource = z.infer<typeof FieldTooltipRuntimeQuerySchema>
