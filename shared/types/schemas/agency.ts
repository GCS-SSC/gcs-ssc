import { z } from 'zod'
import lucideIcons from '@iconify-json/lucide/icons.json'
import type { WithId } from './common'
import { isPositivePostgresBigintText } from '../../utils/database-id'
import type { StatusDefinition } from '../status'
import {
  APPLICANT_RECIPIENT_TYPE_ENUM,
  AGREEMENT_TYPE_ENUM
} from '~~/shared/constants/enums'

/**
 * Builds an Agency bigint identifier schema while preserving field-specific required errors.
 * @param requiredError Stable validation key for a missing identifier.
 * @returns Canonical positive PostgreSQL bigint identifier schema.
 */
const createAgencyBigintIdSchema = (requiredError: string) => z.preprocess(
  value => typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value,
  z.string({ error: requiredError })
    .trim()
    .min(1, { error: requiredError })
    .refine(isPositivePostgresBigintText, { error: 'validation.invalid_selection' })
)

const AgencyRequiredIdSchema = createAgencyBigintIdSchema('validation.id_required')

const AgencyGwcoaIdSchema = createAgencyBigintIdSchema('validation.gwcoa_required')

const AgencyOptionalIdSchema = createAgencyBigintIdSchema('validation.invalid_selection').nullable()

export const AgencyClaimReconciliationStatusConfigurationSchema = z.object({
  startStatusId: AgencyOptionalIdSchema,
  finalStatusId: AgencyOptionalIdSchema
})
export type AgencyClaimReconciliationStatusConfiguration = z.infer<typeof AgencyClaimReconciliationStatusConfigurationSchema>

// --- Agency Profile ---
export const AgencyProfileSchema = z.object({
  egcs_ay_gwcoa_number: AgencyGwcoaIdSchema,
  egcs_ay_agencyfinancialsystemid: AgencyRequiredIdSchema,
  egcs_ay_name_en: z.string({ error: 'validation.name_en_required' }).trim().min(1, { error: 'validation.name_en_required' }),
  egcs_ay_name_fr: z.string({ error: 'validation.name_fr_required' }).trim().min(1, { error: 'validation.name_fr_required' }),
  egcs_ay_abbreviation_en: z
    .string({ error: 'validation.abbr_en_required' })
    .trim()
    .min(1, { error: 'validation.abbr_en_required' }),
  egcs_ay_abbreviation_fr: z
    .string({ error: 'validation.abbr_fr_required' })
    .trim()
    .min(1, { error: 'validation.abbr_fr_required' }),
  egcs_ay_active: z.boolean().default(false)
})
export const AgencyProfilePatchSchema = AgencyProfileSchema.partial().extend({
  egcs_ay_active: z.boolean().optional()
}).refine(
  value => Object.keys(value).length > 0,
  { message: 'validation.required' }
)
export type AgencyProfile = z.infer<typeof AgencyProfileSchema>
export type AgencyProfileItem = WithId<AgencyProfile>

const StatusNameSchema = z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' }).max(255, { error: 'validation.max_length' })
const LucideIconSchema = z.string({ error: 'validation.required' })
  .regex(/^i-lucide-[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: 'validation.invalid_lucide_icon' })
  .refine(value => Object.hasOwn(lucideIcons.icons, value.slice('i-lucide-'.length)), { error: 'validation.invalid_lucide_icon' })
const StatusDefinitionFields = {
  nameEn: StatusNameSchema,
  nameFr: StatusNameSchema,
  color: z.string({ error: 'validation.required' }).regex(/^#[0-9a-f]{6}$/i, { error: 'validation.invalid_hex_color' }),
  icon: LucideIconSchema,
  readOnly: z.boolean(),
  terminal: z.boolean()
}
export const StatusDefinitionBaseSchema = z.object({
  ...StatusDefinitionFields,
  readOnly: z.boolean().default(false),
  terminal: z.boolean().default(false)
})
export const StatusDefinitionCreateSchema = StatusDefinitionBaseSchema.refine(value => !(value.readOnly && value.terminal), {
  message: 'validation.status_flags_exclusive', path: ['terminal']
})
export const StatusDefinitionPatchSchema = z.object(StatusDefinitionFields).partial().superRefine((value, ctx) => {
  if (value.readOnly === true && value.terminal === true) {
    ctx.addIssue({ code: 'custom', message: 'validation.status_flags_exclusive', path: ['terminal'] })
  }
})
export type StatusDefinitionInput = z.infer<typeof StatusDefinitionCreateSchema>
export type StatusDefinitionItem = StatusDefinition

export const AgencyHoldbackBasisSchema = z.object({
  egcs_ay_languageindependentcode: z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' }),
  egcs_ay_name_en: z.string({ error: 'validation.name_en_required' }).trim().min(1, { error: 'validation.name_en_required' }),
  egcs_ay_name_fr: z.string({ error: 'validation.name_fr_required' }).trim().min(1, { error: 'validation.name_fr_required' })
})
export type AgencyHoldbackBasis = z.infer<typeof AgencyHoldbackBasisSchema>
export type AgencyHoldbackBasisItem = WithId<AgencyHoldbackBasis>

// --- Cost Category ---
export const AgencyCostCategorySchema = z.object({
  egcs_ay_name_en: z.string({ error: 'validation.name_en_required' }).trim().min(1, { error: 'validation.name_en_required' }),
  egcs_ay_name_fr: z.string({ error: 'validation.name_fr_required' }).trim().min(1, { error: 'validation.name_fr_required' })
})
export type AgencyCostCategory = z.infer<typeof AgencyCostCategorySchema>
export type AgencyCostCategoryItem = WithId<AgencyCostCategory>

export const AgencyCostCategoryInitial: AgencyCostCategoryItem = {
  id: '',
  egcs_ay_name_en: '',
  egcs_ay_name_fr: ''
}

// --- Cost Category Line Item ---
export const AgencyCostCategoryLineItemSchema = z.object({
  egcs_ay_name_en: z.string({ error: 'validation.name_en_required' }).trim().min(1, { error: 'validation.name_en_required' }),
  egcs_ay_name_fr: z.string({ error: 'validation.name_fr_required' }).trim().min(1, { error: 'validation.name_fr_required' })
})
export type AgencyCostCategoryLineItem = z.infer<typeof AgencyCostCategoryLineItemSchema>
export type AgencyCostCategoryLineItemItem = WithId<AgencyCostCategoryLineItem>

export const AgencyCostCategoryLineItemInitial: AgencyCostCategoryLineItemItem = {
  id: '',
  egcs_ay_name_en: '',
  egcs_ay_name_fr: ''
}

// --- Fiscal Year ---
const AgencyFiscalYearBaseSchema = z.object({
  egcs_ay_fiscalyeardisplay: z
    .string({ error: 'validation.display_required' })
    .trim()
    .min(1, { error: 'validation.display_required' })
    .max(9, { error: 'validation.max_length' }),
  egcs_ay_fiscalyear: z.coerce.number().int().min(1900).max(2100),
  egcs_ay_startdate: z.coerce.date({ error: 'validation.required' }),
  egcs_ay_enddate: z.coerce.date({ error: 'validation.required' })
})
export const AgencyFiscalYearSchema = AgencyFiscalYearBaseSchema.refine(
  value => value.egcs_ay_startdate <= value.egcs_ay_enddate,
  { message: 'validation.date_range', path: ['egcs_ay_enddate'] }
)
export type AgencyFiscalYear = z.infer<typeof AgencyFiscalYearSchema>
export type AgencyFiscalYearItem = WithId<AgencyFiscalYear>

/**
 * Creates fiscal-year form defaults without silently supplying date boundaries.
 * @returns A fresh fiscal-year form item.
 */
export const createAgencyFiscalYearInitial = (): Partial<AgencyFiscalYearItem> => {
  return {
    id: '',
    egcs_ay_fiscalyeardisplay: '',
    egcs_ay_fiscalyear: new Date().getFullYear()
  }
}

// --- Address Type ---
export const AgencyAddressTypeSchema = z.object({
  egcs_ay_typename_en: z
    .string({ error: 'validation.type_en_required' })
    .trim()
    .min(1, { error: 'validation.type_en_required' }),
  egcs_ay_typename_fr: z
    .string({ error: 'validation.type_fr_required' })
    .trim()
    .min(1, { error: 'validation.type_fr_required' })
})
export type AgencyAddressType = z.infer<typeof AgencyAddressTypeSchema>
export type AgencyAddressTypeItem = WithId<AgencyAddressType>

export const AgencyAddressTypeInitial: AgencyAddressTypeItem = {
  id: '',
  egcs_ay_typename_en: '',
  egcs_ay_typename_fr: ''
}

// --- Applicant/Recipient Subtype ---
export const AgencyApplicantRecipientSubtypeSchema = z.object({
  egcs_ay_applicantrecipienttype: z.enum(APPLICANT_RECIPIENT_TYPE_ENUM),
  egcs_ay_name_en: z.string({ error: 'validation.name_en_required' }).trim().min(1, { error: 'validation.name_en_required' }),
  egcs_ay_name_fr: z.string({ error: 'validation.name_fr_required' }).trim().min(1, { error: 'validation.name_fr_required' }),
  egcs_ay_description_en: z
    .string({ error: 'validation.desc_en_required' })
    .trim()
    .min(1, { error: 'validation.desc_en_required' }),
  egcs_ay_description_fr: z
    .string({ error: 'validation.desc_fr_required' })
    .trim()
    .min(1, { error: 'validation.desc_fr_required' })
})
export type AgencyApplicantRecipientSubtype = z.infer<typeof AgencyApplicantRecipientSubtypeSchema>
export type AgencyApplicantRecipientSubtypeItem = WithId<AgencyApplicantRecipientSubtype>

export const AgencyApplicantRecipientSubtypeInitial: AgencyApplicantRecipientSubtypeItem = {
  id: '',
  egcs_ay_applicantrecipienttype: 'other',
  egcs_ay_name_en: '',
  egcs_ay_name_fr: '',
  egcs_ay_description_en: '',
  egcs_ay_description_fr: ''
}

// --- Approval Behalf Type ---
export const AgencyApprovalBehalfTypeSchema = z.object({
  egcs_ay_name_en: z.string({ error: 'validation.name_en_required' }).trim().min(1, { error: 'validation.name_en_required' }),
  egcs_ay_name_fr: z.string({ error: 'validation.name_fr_required' }).trim().min(1, { error: 'validation.name_fr_required' }),
  egcs_ay_require_actual: z.boolean().default(false)
})
export type AgencyApprovalBehalfType = z.infer<typeof AgencyApprovalBehalfTypeSchema>
export type AgencyApprovalBehalfTypeItem = WithId<AgencyApprovalBehalfType>

export const AgencyApprovalBehalfTypeInitial: AgencyApprovalBehalfTypeItem = {
  id: '',
  egcs_ay_name_en: '',
  egcs_ay_name_fr: '',
  egcs_ay_require_actual: false
}

// --- Agreement Type ---
export const AgencyAgreementTypeSchema = z.object({
  egcs_ay_agreementtype: z.enum(AGREEMENT_TYPE_ENUM),
  egcs_ay_name_en: z.string({ error: 'validation.name_en_required' }).trim().min(1, { error: 'validation.name_en_required' }),
  egcs_ay_name_fr: z.string({ error: 'validation.name_fr_required' }).trim().min(1, { error: 'validation.name_fr_required' })
})
export type AgencyAgreementType = z.infer<typeof AgencyAgreementTypeSchema>
export type AgencyAgreementTypeItem = WithId<AgencyAgreementType>

export const AgencyAgreementTypeInitial: AgencyAgreementTypeItem = {
  id: '',
  egcs_ay_agreementtype: 'grant',
  egcs_ay_name_en: '',
  egcs_ay_name_fr: ''
}
