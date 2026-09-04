/* eslint-disable jsdoc/require-jsdoc -- Exported schemas and inferred types are self-describing. */
import { z } from 'zod'
import { CURRENCY_CODES_ENUM } from '~~/shared/constants/enums'
import type { WithId } from './common'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { NonNegativeMoneySchema } from './money'

const OptionalText = (maximumLength?: number) => z.preprocess(
  value => {
    if (value === undefined || value === null) return undefined
    if (typeof value !== 'string') return value
    const trimmedValue = value.trim()
    return trimmedValue.length > 0 ? trimmedValue : undefined
  },
  maximumLength === undefined
    ? z.string().optional()
    : z.string().max(maximumLength, { error: 'validation.max_length' }).optional()
)

const RequiredId = () => z.union([z.string(), z.number()], { error: 'validation.id_required' })
  .transform(value => typeof value === 'number' ? String(value) : value.trim())
  .refine(value => value.length > 0, { error: 'validation.id_required' })
  .refine(isPositivePostgresBigintText, { error: 'validation.invalid_selection' })

const RequiredText = (maximumLength?: number) => {
  const schema = z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' })
  return maximumLength === undefined
    ? schema
    : schema.max(maximumLength, { error: 'validation.max_length' })
}

const addBilingualRequiredIssue = (
  englishValue: string | undefined,
  frenchValue: string | undefined,
  path: string,
  context: z.RefinementCtx
) => {
  if (englishValue === undefined && frenchValue === undefined) {
    context.addIssue({
      code: 'custom',
      message: 'validation.bilingual_value_required',
      path: [path]
    })
  }
}

export const FundingHistoryIdentityBaseSchema = z.object({
  egcs_ar_agencyname_en: OptionalText(255),
  egcs_ar_agencyname_fr: OptionalText(255),
  egcs_ar_programname_en: OptionalText(255),
  egcs_ar_programname_fr: OptionalText(255),
  egcs_ar_agreementnumber: RequiredText(255)
})

const validateFundingHistoryIdentity = (
  value: z.infer<typeof FundingHistoryIdentityBaseSchema>,
  context: z.RefinementCtx
) => {
  addBilingualRequiredIssue(
    value.egcs_ar_agencyname_en,
    value.egcs_ar_agencyname_fr,
    'egcs_ar_agencyname_en',
    context
  )
  addBilingualRequiredIssue(
    value.egcs_ar_programname_en,
    value.egcs_ar_programname_fr,
    'egcs_ar_programname_en',
    context
  )
}

export const FundingHistoryIdentityCreateSchema = FundingHistoryIdentityBaseSchema
  .superRefine(validateFundingHistoryIdentity)

export const FundingHistoryExternalBaseSchema = z.object({
  egcs_ar_title_en: OptionalText(255),
  egcs_ar_title_fr: OptionalText(255),
  egcs_ar_description_en: OptionalText(),
  egcs_ar_description_fr: OptionalText(),
  egcs_ar_startdate: z.coerce.date({ error: 'validation.required' }),
  egcs_ar_enddate: z.coerce.date({ error: 'validation.required' }),
  egcs_ar_fundingamount: NonNegativeMoneySchema,
  egcs_ar_currency: z.enum(CURRENCY_CODES_ENUM, { error: 'validation.required' })
})

const validateFundingHistoryExternal = (
  value: Partial<z.infer<typeof FundingHistoryExternalBaseSchema>>,
  context: z.RefinementCtx
) => {
  if ('egcs_ar_title_en' in value || 'egcs_ar_title_fr' in value) {
    addBilingualRequiredIssue(
      value.egcs_ar_title_en,
      value.egcs_ar_title_fr,
      'egcs_ar_title_en',
      context
    )
  }
  if ('egcs_ar_description_en' in value || 'egcs_ar_description_fr' in value) {
    addBilingualRequiredIssue(
      value.egcs_ar_description_en,
      value.egcs_ar_description_fr,
      'egcs_ar_description_en',
      context
    )
  }
  if (
    value.egcs_ar_startdate !== undefined
    && value.egcs_ar_enddate !== undefined
    && value.egcs_ar_enddate < value.egcs_ar_startdate
  ) {
    context.addIssue({
      code: 'custom',
      message: 'validation.date_range',
      path: ['egcs_ar_enddate']
    })
  }
}

const addDuplicateRecipientIssues = (recipientIds: string[], context: z.RefinementCtx) => {
  const seenRecipientIds = new Set<string>()
  for (const [index, recipientId] of recipientIds.entries()) {
    if (seenRecipientIds.has(recipientId)) {
      context.addIssue({
        code: 'custom',
        message: 'validation.duplicate',
        path: ['recipientIds', index]
      })
    }
    seenRecipientIds.add(recipientId)
  }
}

const FundingHistoryWriteMetadataSchema = z.object({
  recipientIds: z.array(RequiredId(), { error: 'validation.required' })
    .min(1, { error: 'validation.required' }),
  confirmations: z.array(z.string().trim().min(1)).default([])
})

export const FundingHistoryExternalCreateSchema = FundingHistoryIdentityBaseSchema
  .extend(FundingHistoryExternalBaseSchema.shape)
  .extend(FundingHistoryWriteMetadataSchema.shape)
  .superRefine((value, context) => {
    validateFundingHistoryIdentity(value, context)
    validateFundingHistoryExternal(value, context)
    addDuplicateRecipientIssues(value.recipientIds, context)
    addBilingualRequiredIssue(value.egcs_ar_title_en, value.egcs_ar_title_fr, 'egcs_ar_title_en', context)
    addBilingualRequiredIssue(
      value.egcs_ar_description_en,
      value.egcs_ar_description_fr,
      'egcs_ar_description_en',
      context
    )
  })

export const FundingHistoryExternalPatchSchema = FundingHistoryIdentityBaseSchema
  .extend(FundingHistoryExternalBaseSchema.shape)
  .extend({
    recipientIds: FundingHistoryWriteMetadataSchema.shape.recipientIds.optional(),
    confirmations: FundingHistoryWriteMetadataSchema.shape.confirmations
  })
  .partial()
  .superRefine((value, context) => {
    validateFundingHistoryExternal(value, context)
    if (value.recipientIds !== undefined) addDuplicateRecipientIssues(value.recipientIds, context)
  })

export const FundingHistoryRecipientCreateSchema = z.object({
  egcs_ar_applicantrecipient: RequiredId()
})

export type FundingHistoryIdentityCreate = z.infer<typeof FundingHistoryIdentityCreateSchema>
export type FundingHistoryExternalCreate = z.infer<typeof FundingHistoryExternalCreateSchema>
export type FundingHistoryExternalPatch = z.infer<typeof FundingHistoryExternalPatchSchema>
export type FundingHistoryExternalItem = WithId<z.infer<typeof FundingHistoryExternalBaseSchema>>
export type FundingHistoryRecipientCreate = z.infer<typeof FundingHistoryRecipientCreateSchema>
