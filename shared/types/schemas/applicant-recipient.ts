import { z } from 'zod'
import type { WithId } from './common'
import { REGISTRY_TYPE_ENUM } from '~~/shared/constants/enums'
import { CommonAddressCreateSchema, CommonAddressPatchSchema, CommonContactCreateSchema, CommonContactPatchSchema } from './admin-common'
import { isCanonicalPostgresBigintText } from '~~/shared/utils/database-id'

/**
 * Creates a required ID schema that accepts string or numeric input.
 *
 * @param errorKey Translation key used when the identifier is missing.
 * @returns Normalized string identifier schema.
 */
const RequiredId = (errorKey: string) =>
  z.union([z.string(), z.number()], { error: errorKey })
    .transform(value => typeof value === 'number' ? String(value) : value.trim())
    .refine(value => value.length > 0, { error: errorKey })

/**
 * Creates an optional trimmed text schema that collapses blank strings.
 *
 * @returns Optional text schema.
 */
const OptionalText = () =>
  z.preprocess(
    value => {
      if (value === undefined || value === null) return undefined
      if (typeof value !== 'string') return value
      const trimmedValue = value.trim()
      return trimmedValue.length > 0 ? trimmedValue : undefined
    },
    z.string().optional()
  )

export const ApplicantRecipientProfileBaseSchema = z.object({
  egcs_ar_description_en: OptionalText(),
  egcs_ar_description_fr: OptionalText(),
  egcs_ar_operatingname_en: OptionalText(),
  egcs_ar_operatingname_fr: OptionalText(),
  egcs_ar_applicantrecipientsubtypes: RequiredId('validation.applicant_recipient_subtype_required'),
  egcs_ar_leadagency: RequiredId('validation.lead_agency_required'),
  egcs_ar_legalname_en: OptionalText(),
  egcs_ar_legalname_fr: OptionalText(),
  egcs_ar_researchorganization_en: OptionalText(),
  egcs_ar_researchorganization_fr: OptionalText(),
  egcs_ar_active: z.boolean().optional()
})

/**
 * Adds one model-level issue, targeted to the English field, when neither official-language value is populated.
 *
 * @param value - Bilingual profile fields.
 * @param value.egcs_ar_description_en - English description.
 * @param value.egcs_ar_description_fr - French description.
 * @param value.egcs_ar_operatingname_en - English operating name.
 * @param value.egcs_ar_operatingname_fr - French operating name.
 * @param value.egcs_ar_legalname_en - English legal name.
 * @param value.egcs_ar_legalname_fr - French legal name.
 * @param context - Zod refinement context.
 */
const validateBilingualProfileFields = (
  value: {
    egcs_ar_description_en?: string
    egcs_ar_description_fr?: string
    egcs_ar_operatingname_en?: string
    egcs_ar_operatingname_fr?: string
    egcs_ar_legalname_en?: string
    egcs_ar_legalname_fr?: string
  },
  context: z.RefinementCtx
) => {
  if (value.egcs_ar_description_en === undefined && value.egcs_ar_description_fr === undefined) {
    context.addIssue({
      code: 'custom',
      message: 'validation.applicant_recipient_description_required',
      path: ['egcs_ar_description_en']
    })
  }
  if (value.egcs_ar_operatingname_en === undefined && value.egcs_ar_operatingname_fr === undefined) {
    context.addIssue({
      code: 'custom',
      message: 'validation.applicant_recipient_operating_name_required',
      path: ['egcs_ar_operatingname_en']
    })
  }
  if (value.egcs_ar_legalname_en === undefined && value.egcs_ar_legalname_fr === undefined) {
    context.addIssue({
      code: 'custom',
      message: 'validation.applicant_recipient_legal_name_required',
      path: ['egcs_ar_legalname_en']
    })
  }
}

export const ApplicantRecipientProfileBilingualSchema = z.object({
  egcs_ar_description_en: OptionalText(),
  egcs_ar_description_fr: OptionalText(),
  egcs_ar_operatingname_en: OptionalText(),
  egcs_ar_operatingname_fr: OptionalText(),
  egcs_ar_legalname_en: OptionalText(),
  egcs_ar_legalname_fr: OptionalText()
}).superRefine(validateBilingualProfileFields)

export const ApplicantRecipientProfileCreateSchema = ApplicantRecipientProfileBaseSchema.extend({
  egcs_ar_active: z.boolean().default(false)
}).superRefine(validateBilingualProfileFields)

export const ApplicantRecipientProfileSchema = ApplicantRecipientProfileCreateSchema

export const ApplicantRecipientProfilePatchSchema = ApplicantRecipientProfileBaseSchema.partial().superRefine(() => undefined)

export type ApplicantRecipientProfile = z.infer<typeof ApplicantRecipientProfileSchema>
export type ApplicantRecipientProfileItem = WithId<ApplicantRecipientProfile>
export type ApplicantRecipientProfilePatch = z.infer<typeof ApplicantRecipientProfilePatchSchema>

export const ApplicantRecipientRegistryBaseSchema = z.object({
  egcs_ar_number: z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' }),
  egcs_ar_registry: z.enum(REGISTRY_TYPE_ENUM, { error: 'validation.required' }),
  egcs_ar_othercomment: OptionalText()
})

/**
 * Validates registry fields whose requiredness and format depend on the selected registry type.
 *
 * @param value - Registry values to validate.
 * @param context - Zod refinement context.
 */
const validateApplicantRecipientRegistry = (
  value: Partial<z.infer<typeof ApplicantRecipientRegistryBaseSchema>>,
  context: z.RefinementCtx
) => {
  const numberPatternByRegistry = {
    federalbusinessnumber: /^[0-9]{9}$/,
    craprogramaccountnumber: /^[0-9]{15}$/,
    naics: /^[0-9]{2,6}$/
  } as const
  if (
    value.egcs_ar_number !== undefined
    && value.egcs_ar_registry !== undefined
    && value.egcs_ar_registry in numberPatternByRegistry
    && !numberPatternByRegistry[value.egcs_ar_registry as keyof typeof numberPatternByRegistry].test(value.egcs_ar_number)
  ) {
    context.addIssue({
      code: 'custom',
      message: 'validation.applicant_recipient_registry_number_invalid',
      path: ['egcs_ar_number']
    })
  }
  if (value.egcs_ar_registry === 'other' && value.egcs_ar_othercomment === undefined) {
    context.addIssue({
      code: 'custom',
      message: 'validation.required',
      path: ['egcs_ar_othercomment']
    })
  }
}

export const ApplicantRecipientRegistryCreateSchema = ApplicantRecipientRegistryBaseSchema
  .superRefine(validateApplicantRecipientRegistry)
export const ApplicantRecipientRegistryPatchSchema = ApplicantRecipientRegistryBaseSchema.partial()
  .superRefine(validateApplicantRecipientRegistry)

export type ApplicantRecipientRegistry = z.infer<typeof ApplicantRecipientRegistryCreateSchema>
export type ApplicantRecipientRegistryPatch = z.infer<typeof ApplicantRecipientRegistryPatchSchema>
export type ApplicantRecipientRegistryItem = WithId<ApplicantRecipientRegistry>

export const ApplicantRecipientAgencyFinancialIdBaseSchema = z.object({
  egcs_ar_agency: z.union([z.string(), z.number()]).optional()
    .transform(value => value === undefined ? undefined : String(value).trim())
    .refine(value => value === undefined || value.length > 0, { error: 'validation.id_required' }),
  egcs_ar_financialsystemid: z.union([
    z.string(),
    z.bigint().transform(value => String(value)),
    z.number().int({ error: 'validation.invalid_number' }).safe({ error: 'validation.invalid_number' }).transform(value => String(value))
  ], { error: 'validation.required' })
    .transform(value => value.trim())
    .refine(value => value.length > 0, { error: 'validation.required' })
    .refine(isCanonicalPostgresBigintText, { error: 'validation.invalid_number' })
})

export const ApplicantRecipientAgencyFinancialIdCreateSchema = ApplicantRecipientAgencyFinancialIdBaseSchema
export const ApplicantRecipientAgencyFinancialIdPatchSchema = ApplicantRecipientAgencyFinancialIdBaseSchema.partial().superRefine(() => undefined)

export type ApplicantRecipientAgencyFinancialId = z.infer<typeof ApplicantRecipientAgencyFinancialIdCreateSchema>
export type ApplicantRecipientAgencyFinancialIdPatch = z.infer<typeof ApplicantRecipientAgencyFinancialIdPatchSchema>
export type ApplicantRecipientAgencyFinancialIdItem = WithId<ApplicantRecipientAgencyFinancialId>

export const ApplicantRecipientOtherNameBaseSchema = z.object({
  egcs_ar_othername: z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' })
})

export const ApplicantRecipientOtherNameCreateSchema = ApplicantRecipientOtherNameBaseSchema
export const ApplicantRecipientOtherNamePatchSchema = ApplicantRecipientOtherNameBaseSchema.partial().superRefine(() => undefined)

export type ApplicantRecipientOtherName = z.infer<typeof ApplicantRecipientOtherNameCreateSchema>
export type ApplicantRecipientOtherNamePatch = z.infer<typeof ApplicantRecipientOtherNamePatchSchema>
export type ApplicantRecipientOtherNameItem = WithId<ApplicantRecipientOtherName>

export const ApplicantRecipientAddressCreateSchema = CommonAddressCreateSchema
export const ApplicantRecipientAddressPatchSchema = CommonAddressPatchSchema
export type ApplicantRecipientAddress = z.infer<typeof ApplicantRecipientAddressCreateSchema>
export type ApplicantRecipientAddressPatch = z.infer<typeof ApplicantRecipientAddressPatchSchema>
export type ApplicantRecipientAddressItem = WithId<ApplicantRecipientAddress>

export const ApplicantRecipientContactCreateSchema = CommonContactCreateSchema
export const ApplicantRecipientContactPatchSchema = CommonContactPatchSchema.extend({
  _deleted: z.never({ error: 'validation.delete_via_delete' }).optional()
})
export type ApplicantRecipientContact = z.infer<typeof ApplicantRecipientContactCreateSchema>
export type ApplicantRecipientContactPatch = z.infer<typeof ApplicantRecipientContactPatchSchema>
export type ApplicantRecipientContactItem = WithId<ApplicantRecipientContact>
