/* eslint-disable jsdoc/require-jsdoc -- Note schema helpers are local to this contract. */
import { z } from 'zod'
import { PositivePostgresBigintIdSchema } from './common'

const noteText = (maxLength?: number) => z.preprocess(value => {
  if (value === null || value === undefined) return undefined
  if (typeof value !== 'string') return value
  return value.trim() || undefined
}, z.string().superRefine((value, context) => {
  if (value.includes('\u0000')) context.addIssue({ code: 'custom', message: 'validation.invalid_text_character' })
  if (maxLength !== undefined && Array.from(value).length > maxLength) {
    context.addIssue({ code: 'too_big', origin: 'string', maximum: maxLength, inclusive: true, message: 'validation.max_length' })
  }
}).optional()).meta({ formRequired: false })

const validateLanguages = (value: Record<string, unknown>, context: z.RefinementCtx, prefix: 'egcs_ar' | 'egcs_fc') => {
  if (!value[`${prefix}_subject_en`] && !value[`${prefix}_subject_fr`]) {
    context.addIssue({ code: 'custom', message: 'validation.note_subject_required', path: [`${prefix}_subject_en`] })
  }
  if (!value[`${prefix}_body_en`] && !value[`${prefix}_body_fr`]) {
    context.addIssue({ code: 'custom', message: 'validation.note_body_required', path: [`${prefix}_body_en`] })
  }
}

export const ApplicantRecipientNoteBaseSchema = z.object({
  egcs_ar_agency: PositivePostgresBigintIdSchema.meta({ formRequired: true }),
  egcs_ar_subject_en: noteText(255),
  egcs_ar_subject_fr: noteText(255),
  egcs_ar_body_en: noteText(),
  egcs_ar_body_fr: noteText()
})
export const ApplicantRecipientNoteCreateSchema = ApplicantRecipientNoteBaseSchema.superRefine((value, context) => validateLanguages(value, context, 'egcs_ar'))
export const ApplicantRecipientNotePatchSchema = ApplicantRecipientNoteBaseSchema.omit({ egcs_ar_agency: true }).partial()

export const FundingCaseAgreementNoteBaseSchema = z.object({
  egcs_fc_subject_en: noteText(255),
  egcs_fc_subject_fr: noteText(255),
  egcs_fc_body_en: noteText(),
  egcs_fc_body_fr: noteText()
})
export const FundingCaseAgreementNoteCreateSchema = FundingCaseAgreementNoteBaseSchema.superRefine((value, context) => validateLanguages(value, context, 'egcs_fc'))
export const FundingCaseAgreementNotePatchSchema = FundingCaseAgreementNoteBaseSchema.partial()
