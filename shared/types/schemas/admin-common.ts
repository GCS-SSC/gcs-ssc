import { RequiredDateSchema } from './form-input'
import { WorkflowMemberConditionsSchema } from './agreement-custom-fields'
import { z } from 'zod'
import { isCanonicalPostgresBigintText } from '../../utils/database-id'
import { isRepresentableByNumeric } from '../../utils/decimal'
import { RecommendationDefinitionSchema } from './recommendation/recommendation'
import {
  createWorkflowTargetEntityTypeIdentitySchema,
  DirectReviewEntityTypeIdentitySchema,
  PositivePostgresBigintIdSchema
} from './common'
import type { JsonValue } from '../database'
import {
  COMPLETION_ENTITY_TYPE_ENUM,
  COUNTRIES_ENUM,
  ENTITY_TYPE_ENUM,
  EXECUTION_ENTITY_TYPE_ENUM,
  JURISDICTION_ENUM,
  LANGUAGE_PREFERENCE_ENUM,
  RECOMMENDATION_EXECUTION_ENTITY_TYPE_ENUM,
  REVIEW_TARGET_ENTITY_TYPE_ENUM,
  REVIEW_TYPE_ENUM,
  SCOPE_ENTITY_TYPE_ENUM
} from '../../constants/enums'

export {
  COMPLETION_ENTITY_TYPE_ENUM,
  EXECUTION_ENTITY_TYPE_ENUM,
  RECOMMENDATION_EXECUTION_ENTITY_TYPE_ENUM,
  REVIEW_TARGET_ENTITY_TYPE_ENUM,
  SCOPE_ENTITY_TYPE_ENUM
}

const IdSchema = z.preprocess(value => {
  if (value === undefined || value === null) {
    return ''
  }

  return value
}, z.coerce.string({ error: 'validation.id_required' }).min(1, { error: 'validation.id_required' })).meta({ formRequired: true })
const RequiredPostgresBigintIdSchema = (key: string) => z.unknown()
  .refine(value => value !== undefined && value !== null && value !== '', { error: key })
  .pipe(PositivePostgresBigintIdSchema).meta({ formRequired: true })
const OptionalIdSchema = z.preprocess(value => {
  if (value === undefined || value === null || value === '') return undefined
  return value
}, z.coerce.string().min(1).optional()).meta({ formRequired: false })
const NullableOptionalIdSchema = z.preprocess(value => {
  if (value === undefined || value === '') return undefined
  if (value === null) return null
  return value
}, z.union([z.null(), z.coerce.string().min(1)]).optional()).meta({ formRequired: false })
const RequiredString = (key: string) => z.string({ error: key }).min(1, { error: key })
const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema)])
)
const JsonObjectSchema = z.record(z.string(), JsonValueSchema).meta({ formRequired: true })
export const COMMON_ENTITY_TYPE_ENUM = ENTITY_TYPE_ENUM
export const REVIEW_TYPES = REVIEW_TYPE_ENUM
export type CommonEntityType = (typeof COMMON_ENTITY_TYPE_ENUM)[number]
export type ScopeEntityType = (typeof SCOPE_ENTITY_TYPE_ENUM)[number]
export type ExecutionEntityType = (typeof EXECUTION_ENTITY_TYPE_ENUM)[number]
export type CompletionEntityType = (typeof COMPLETION_ENTITY_TYPE_ENUM)[number]
export type ReviewTargetEntityType = (typeof REVIEW_TARGET_ENTITY_TYPE_ENUM)[number]
export type RecommendationExecutionEntityType = (typeof RECOMMENDATION_EXECUTION_ENTITY_TYPE_ENUM)[number]

const DELETED_FILTER_VALUES = new Map<unknown, boolean>([
  [true, true],
  ['true', true],
  ['1', true],
  [false, false],
  ['false', false],
  ['0', false]
])

const isEmptyFilterValue = (value: unknown) => value === undefined || value === null || value === ''

const normalizeDeletedFilterValue = (value: unknown) => {
  return isEmptyFilterValue(value) ? undefined : DELETED_FILTER_VALUES.get(value) ?? value
}

const DeletedFilterSchema = z.preprocess(normalizeDeletedFilterValue, z.boolean().optional())
const OptionalIdFilterSchema = z.preprocess(value => {
  if (isEmptyFilterValue(value)) return undefined
  return value
}, PositivePostgresBigintIdSchema.optional())
const OptionalEnumFilterSchema = <TValues extends readonly [string, ...string[]]>(values: TValues) => z.preprocess(value => {
  if (isEmptyFilterValue(value)) return undefined
  return String(value)
}, z.enum(values).optional())

export const AdminCommonListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().refine(value => !value.includes('\u0000'), {
    error: 'validation.invalid_text_character'
  }).optional(),
  status: z.enum(['all', 'active', 'deleted']).optional(),
  deleted: DeletedFilterSchema,
  agencyId: OptionalIdFilterSchema,
  streamId: OptionalIdFilterSchema,
  approvalTemplateId: OptionalIdFilterSchema,
  workflowSetupId: OptionalIdFilterSchema,
  reviewType: OptionalEnumFilterSchema(REVIEW_TYPES),
  entityType: OptionalEnumFilterSchema(ENTITY_TYPE_ENUM)
})

// CommonReadOnlySchema is intentionally empty for read-only resources that accept no input,
// unlike editable schemas such as CommonGwcoaCreateSchema and CommonGwcoaPatchSchema.
export const CommonReadOnlySchema = z.object({})

/** Builds a required catalog name with PostgreSQL varchar character-count semantics.
 * @param requiredKey Localized validation key for an empty name.
 * @returns Name schema limited to 255 Unicode code points.
 */
const CatalogNameSchema = (requiredKey: string) => RequiredString(requiredKey).superRefine((value, context) => {
  if (Array.from(value).length > 255) {
    context.addIssue({ code: 'too_big', origin: 'string', maximum: 255, inclusive: true, message: 'validation.max_length' })
  }
  if (value.includes('\u0000')) {
    context.addIssue({ code: 'custom', message: 'validation.invalid_text_character' })
  }
})

/** Rejects empty Attachment Type labels without normalizing authored contents.
 * @param requiredKey Localized validation key for a blank name.
 * @returns Bounded catalog name preserving nonblank whitespace.
 */
const AttachmentTypeNameSchema = (requiredKey: string) => CatalogNameSchema(requiredKey)
  .refine(value => value.trim().length > 0, { error: requiredKey })

/** Builds a required description that PostgreSQL text can store without normalization.
 * @param requiredKey Localized validation key for an empty description.
 * @returns Description schema preserving ordinary whitespace and line breaks.
 */
const AttachmentTypeDescriptionSchema = (requiredKey: string) => RequiredString(requiredKey)
  .refine(value => !value.includes('\u0000'), { error: 'validation.invalid_text_character' })

export const CommonGwcoaCreateSchema = z.object({
  egcs_cn_number: z.coerce.number({ error: 'validation.required' })
    .int({ error: 'validation.invalid_number' })
    .min(0, { error: 'validation.invalid_number' })
    .max(32767, { error: 'validation.invalid_number' }),
  egcs_cn_name_en: CatalogNameSchema('validation.name_en_required'),
  egcs_cn_name_fr: CatalogNameSchema('validation.name_fr_required')
})
export const CommonGwcoaPatchSchema = CommonGwcoaCreateSchema.partial().extend({ _deleted: z.boolean().optional() })

/** Validates Contact text against storage without changing existing whitespace semantics.
 * @param schema Base string validation for the field.
 * @param bounded Whether the column has a 255-character storage limit.
 * @returns String schema enforcing the field's storage constraints.
 */
const ContactTextSchema = (schema: z.ZodString, bounded = true) => schema.superRefine((value, context) => {
  if (bounded && Array.from(value).length > 255) {
    context.addIssue({ code: 'too_big', origin: 'string', maximum: 255, inclusive: true, message: 'validation.max_length' })
  }
  if (value.includes('\u0000')) context.addIssue({ code: 'custom', message: 'validation.invalid_text_character' })
})

/** Normalizes integral decimal phone values exactly before applying bigint storage bounds.
 * @param value Submitted phone or extension value.
 * @returns Exact normalized text, nullable omission, or the original invalid value.
 */
const normalizeContactPhone = (value: unknown): unknown => {
  if (value === null || value === undefined) return value
  if (typeof value === 'number') return Number.isSafeInteger(value) ? String(value) : value
  if (typeof value === 'bigint') return String(value)
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text) return null
  const match = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d+))?$/i.exec(text)
  if (!match) return value
  const [whole = '', fraction = ''] = match[2]!.split('.')
  let digits = `${whole}${fraction}`.replace(/^0+/, '')
  if (!digits) return '0'
  const scale = Number(match[3] ?? '0') - fraction.length
  if (!Number.isSafeInteger(scale)) return value
  if (scale < 0) {
    if (-scale > digits.length || !/^0*$/.test(digits.slice(digits.length + scale))) return value
    digits = digits.slice(0, digits.length + scale)
  } else {
    if (digits.length + scale > 19) return value
    digits += '0'.repeat(scale)
  }
  return `${match[1] === '-' ? '-' : ''}${digits}`
}

/** Preserves signed bigint phone values, safe numeric compatibility and explicit clearing. */
const ContactPhoneSchema = z.preprocess(normalizeContactPhone,
  z.string({ error: 'validation.invalid_number' })
    .refine(isCanonicalPostgresBigintText, { error: 'validation.invalid_number' })
    .nullable().optional()).meta({ formRequired: false })

export const CommonContactCreateSchema = z.object({
  egcs_cn_title: ContactTextSchema(z.string()).nullable().optional(),
  egcs_cn_name: ContactTextSchema(RequiredString('validation.name_required')),
  egcs_cn_businessphone: ContactPhoneSchema,
  egcs_cn_businessphoneextension: ContactPhoneSchema,
  egcs_cn_generallanguagepreference: z.enum(LANGUAGE_PREFERENCE_ENUM, { error: 'validation.language_required' }),
  egcs_cn_jobtitle_en: ContactTextSchema(RequiredString('validation.job_title_en_required')),
  egcs_cn_jobtitle_fr: ContactTextSchema(RequiredString('validation.job_title_fr_required')),
  egcs_cn_primaryaccount: z.boolean({ error: 'validation.primary_account_required' }),
  egcs_cn_email: ContactTextSchema(RequiredString('validation.email_required'), false)
})
export const CommonContactPatchSchema = CommonContactCreateSchema.partial().extend({ _deleted: z.boolean().optional() })

/** Preserves all signed PostgreSQL bigint values without passing text through Number.
 * @param requiredKey Localized required-field error.
 * @returns Canonical text with safe numeric compatibility input.
 */
const AddressBigintSchema = (requiredKey: string) => z.union([
  z.string(),
  z.bigint().transform(value => String(value)),
  z.number().int({ error: 'validation.invalid_number' }).safe({ error: 'validation.invalid_number' })
    .transform(value => String(value))
], { error: requiredKey })
  .transform(value => value.trim())
  .refine(value => value.length > 0, { error: requiredKey })
  .refine(isCanonicalPostgresBigintText, { error: 'validation.invalid_number' }).meta({ formRequired: true })

/** Applies the existing varchar storage boundary without changing whitespace semantics.
 * @param schema Required or optional-content string schema.
 * @returns A string that PostgreSQL can persist in the address column.
 */
const AddressTextSchema = (schema: z.ZodString) => schema.superRefine((value, context) => {
  if (Array.from(value).length > 255) {
    context.addIssue({ code: 'too_big', origin: 'string', maximum: 255, inclusive: true, message: 'validation.max_length' })
  }
  if (value.includes('\u0000')) {
    context.addIssue({ code: 'custom', message: 'validation.invalid_text_character' })
  }
})

const AddressCoordinateSchema = z.coerce.number()
  .refine(value => isRepresentableByNumeric(value, 10, 7), { error: 'validation.numeric_not_representable' })

export const CommonAddressBaseSchema = z.object({
  egcs_cn_federalridingid: z.coerce.number({ error: 'validation.federal_riding_id_required' })
    .int({ error: 'validation.invalid_number' })
    .min(-2147483648, { error: 'validation.invalid_number' })
    .max(2147483647, { error: 'validation.invalid_number' }).meta({ formRequired: true }),
  egcs_cn_addresscity: AddressTextSchema(RequiredString('validation.city_required')),
  egcs_cn_addresscountry: z.enum(COUNTRIES_ENUM),
  egcs_cn_addresssubdivision: AddressTextSchema(RequiredString('validation.required')),
  egcs_cn_gcaddressid: z.preprocess(value => isEmptyFilterValue(value) ? undefined : value,
    AddressBigintSchema('validation.invalid_number').optional()).meta({ formRequired: false }),
  egcs_cn_latitude: AddressCoordinateSchema.optional(),
  egcs_cn_longitude: AddressCoordinateSchema.optional(),
  egcs_cn_mainphone: AddressBigintSchema('validation.main_phone_required'),
  egcs_cn_mainphoneextension: z.coerce.number().int({ error: 'validation.invalid_number' })
    .min(-32768, { error: 'validation.invalid_number' })
    .max(32767, { error: 'validation.invalid_number' }).optional(),
  egcs_cn_postalcodezipcode: AddressTextSchema(RequiredString('validation.postal_code_required')),
  egcs_cn_street1: AddressTextSchema(RequiredString('validation.street1_required')),
  egcs_cn_street2: AddressTextSchema(z.string()).optional(),
  egcs_cn_street3: AddressTextSchema(z.string()).optional()
})

// eslint-disable-next-line jsdoc/require-jsdoc -- local refinement helper has explicit typed parameters
const validateAddressSubdivision = (
  country: string | undefined,
  subdivision: string | undefined,
  ctx: z.RefinementCtx
): void => {
  if (country?.toLowerCase() !== 'ca') {
    return
  }

  if (!subdivision || !JURISDICTION_ENUM.includes(subdivision as (typeof JURISDICTION_ENUM)[number])) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['egcs_cn_addresssubdivision'],
      message: 'validation.invalid_selection'
    })
  }
}

export const CommonAddressCreateSchema = CommonAddressBaseSchema.superRefine((data, ctx) => {
  validateAddressSubdivision(data.egcs_cn_addresscountry, data.egcs_cn_addresssubdivision, ctx)
})

// Agreement partial updates validate these effective fields after loading the
// current address, without parsing or coercing unrelated persisted columns.
export const CommonAddressSubdivisionSchema = CommonAddressBaseSchema.pick({
  egcs_cn_addresscountry: true,
  egcs_cn_addresssubdivision: true
}).superRefine((data, ctx) => {
  validateAddressSubdivision(data.egcs_cn_addresscountry, data.egcs_cn_addresssubdivision, ctx)
})

export const CommonAddressPatchSchema = CommonAddressBaseSchema.partial()
  .superRefine((data, ctx) => {
    if (data.egcs_cn_addresscountry?.toLowerCase() === 'ca' && data.egcs_cn_addresssubdivision === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['egcs_cn_addresssubdivision'],
        message: 'validation.required'
      })
      return
    }

    if (data.egcs_cn_addresscountry && data.egcs_cn_addresssubdivision !== undefined) {
      validateAddressSubdivision(data.egcs_cn_addresscountry, data.egcs_cn_addresssubdivision, ctx)
    }
  })
  .extend({ _deleted: z.boolean().optional() })

export const CommonCompletionCreateSchema = z.object({
  egcs_cn_entitytype: z.enum(COMPLETION_ENTITY_TYPE_ENUM, { error: 'validation.required' }),
  egcs_cn_entityid: IdSchema,
  egcs_cn_comments: z.string().optional(),
  egcs_cn_user: IdSchema,
  egcs_cn_completedat: RequiredDateSchema
})
export const CommonCompletionPatchSchema = CommonCompletionCreateSchema.partial().extend({ _deleted: z.boolean().optional() })

export const CommonCertificationCreateSchema = z.object({
  egcs_cn_order: z.coerce.number({ error: 'validation.required' }).int(),
  egcs_cn_description_en: RequiredString('validation.desc_en_required'),
  egcs_cn_description_fr: RequiredString('validation.desc_fr_required'),
  egcs_cn_name_en: RequiredString('validation.name_en_required'),
  egcs_cn_name_fr: RequiredString('validation.name_fr_required'),
  egcs_cn_optional: z.boolean().optional(),
  egcs_cn_certification_en: RequiredString('validation.certification_required'),
  egcs_cn_certification_fr: RequiredString('validation.certification_required'),
  egcs_cn_approvalstep: IdSchema
})
export const CommonCertificationPatchSchema = CommonCertificationCreateSchema.partial().extend({
  _deleted: z.boolean().optional()
})

export const CommonApprovalTemplateCreateSchema = z.object({
  egcs_cn_description_en: RequiredString('validation.desc_en_required'),
  egcs_cn_description_fr: RequiredString('validation.desc_fr_required'),
  egcs_cn_name_en: RequiredString('validation.name_en_required'),
  egcs_cn_name_fr: RequiredString('validation.name_fr_required')
}).strict()
export const CommonApprovalTemplatePatchSchema = CommonApprovalTemplateCreateSchema.partial().extend({
  _deleted: z.boolean().optional()
})

export const CommonApprovalStepCreateSchema = z.object({
  egcs_cn_sequence: z.coerce.number({ error: 'validation.sequence_required' }).int(),
  egcs_cn_description_en: RequiredString('validation.desc_en_required'),
  egcs_cn_description_fr: RequiredString('validation.desc_fr_required'),
  egcs_cn_name_en: RequiredString('validation.name_en_required'),
  egcs_cn_name_fr: RequiredString('validation.name_fr_required'),
  egcs_cn_approvaltemplate: IdSchema,
  egcs_cn_defaultuser: IdSchema,
  egcs_cn_approvertitle: RequiredString('validation.approval_position_required')
})
export const CommonApprovalStepPatchSchema = CommonApprovalStepCreateSchema.partial().extend({ _deleted: z.boolean().optional() })

export const CommonRoutingSlipCreateSchema = z.object({
  egcs_cn_entitytype: z.enum(COMMON_ENTITY_TYPE_ENUM, { error: 'validation.required' }),
  egcs_cn_entityid: IdSchema,
  egcs_cn_name_en: RequiredString('validation.name_en_required'),
  egcs_cn_name_fr: RequiredString('validation.name_fr_required'),
  egcs_cn_approvaltemplate: IdSchema,
  egcs_cn_runtimeitem: IdSchema
})
export const CommonRoutingSlipPatchSchema = CommonRoutingSlipCreateSchema.partial().extend({ _deleted: z.boolean().optional() })

export const CommonApprovalCreateSchema = z.object({
  egcs_cn_sequence: z.coerce.number({ error: 'validation.sequence_required' }),
  egcs_cn_name_en: RequiredString('validation.name_en_required'),
  egcs_cn_name_fr: RequiredString('validation.name_fr_required'),
  egcs_cn_routingslip: IdSchema,
  egcs_cn_defaultuser: IdSchema,
  egcs_cn_assigneduser: IdSchema.optional(),
  egcs_cn_onbehalf: IdSchema.optional(),
  egcs_cn_approvalpositiontitle: z.string().optional(),
  egcs_cn_isadded: z.boolean({ error: 'validation.is_added_required' }),
  egcs_cn_approvalvalue: z.boolean({ error: 'validation.approval_value_required' }).optional(),
  egcs_cn_approvaldate: z.coerce.date().optional(),
  egcs_cn_attachment: IdSchema.optional()
})
export const CommonApprovalPatchSchema = CommonApprovalCreateSchema.partial()

export const CommonApprovalCertificationCreateSchema = z.object({
  egcs_cn_optional: z.boolean({ error: 'validation.required' }),
  egcs_cn_certification_en: RequiredString('validation.certification_required'),
  egcs_cn_certification_fr: RequiredString('validation.certification_required'),
  egcs_cn_value: z.boolean().optional(),
  egcs_cn_approval: IdSchema
})
export const CommonApprovalCertificationPatchSchema = CommonApprovalCertificationCreateSchema.partial()

export const CommonAssessmentOutcomeCreateSchema = z.object({
  egcs_cn_review: IdSchema,
  egcs_cn_section: RequiredString('validation.section_required'),
  egcs_cn_subsection: RequiredString('validation.subsection_required'),
  egcs_cn_name_en: RequiredString('validation.name_en_required'),
  egcs_cn_name_fr: RequiredString('validation.name_fr_required'),
  egcs_cn_recommendedstrategy: RequiredString('validation.recommended_strategy_required'),
  egcs_cn_accepted: z.boolean({ error: 'validation.accepted_required' }),
  egcs_cn_selectedstrategy: RequiredString('validation.selected_strategy_required'),
  egcs_cn_justification: z.string().optional(),
  egcs_cn_comment: RequiredString('validation.comment_required')
})
export const CommonAssessmentOutcomePatchSchema = CommonAssessmentOutcomeCreateSchema.partial().extend({
  id: IdSchema.optional()
})

export const CommonAttachmentTypeCreateSchema = z.object({
  egcs_cn_agency: IdSchema,
  egcs_cn_name_en: AttachmentTypeNameSchema('validation.name_en_required'),
  egcs_cn_name_fr: AttachmentTypeNameSchema('validation.name_fr_required'),
  egcs_cn_description_en: AttachmentTypeDescriptionSchema('validation.desc_en_required'),
  egcs_cn_description_fr: AttachmentTypeDescriptionSchema('validation.desc_fr_required')
})
export const CommonAttachmentTypePatchSchema = CommonAttachmentTypeCreateSchema.partial().extend({
  _deleted: z.boolean().optional()
})
export const AgencyAttachmentTypeSchema = CommonAttachmentTypeCreateSchema.omit({ egcs_cn_agency: true })
export type AgencyAttachmentTypeItem = z.infer<typeof AgencyAttachmentTypeSchema> & { id: string }

export const CommonReviewSchemaCreateSchema = z.object({
  egcs_cn_reviewtype: z.enum(REVIEW_TYPES, { error: 'validation.required' }),
  egcs_cn_agency: IdSchema,
  egcs_cn_entitytype: DirectReviewEntityTypeIdentitySchema,
  egcs_cn_name_en: RequiredString('validation.name_en_required'),
  egcs_cn_name_fr: RequiredString('validation.name_fr_required'),
  egcs_cn_outcomename_en: RequiredString('validation.outcome_name_en_required'),
  egcs_cn_outcomename_fr: RequiredString('validation.outcome_name_fr_required'),
  egcs_cn_disablecustomoutcomes: z.boolean({ error: 'validation.required' }).default(false),
  egcs_cn_disablealignment: z.boolean({ error: 'validation.required' }).default(false),
  egcs_cn_disablereviewers: z.boolean({ error: 'validation.required' }).default(false),
  egcs_cn_scoringmatrix: JsonObjectSchema,
  egcs_cn_assessmentschema: JsonObjectSchema
})
export const AgencyReviewSchemaCreateSchema = CommonReviewSchemaCreateSchema.pick({
  egcs_cn_reviewtype: true,
  egcs_cn_entitytype: true,
  egcs_cn_name_en: true,
  egcs_cn_name_fr: true,
  egcs_cn_outcomename_en: true,
  egcs_cn_outcomename_fr: true
}).strict()
export const CommonReviewSchemaPatchSchema = CommonReviewSchemaCreateSchema.omit({
  egcs_cn_entitytype: true
}).partial().extend({
  _deleted: z.boolean().optional()
})

export const CommonReviewSetupCreateSchema = z.object({
  egcs_cn_entitytype: DirectReviewEntityTypeIdentitySchema,
  egcs_cn_order: z.coerce.number({ error: 'validation.required' }).int(),
  egcs_cn_reviewset: IdSchema,
  egcs_cn_approvaltemplate: IdSchema.optional(),
  egcs_cn_reviewschema: IdSchema
})
export const CommonReviewSetupPatchSchema = CommonReviewSetupCreateSchema.partial().extend({
  _deleted: z.boolean().optional()
})

export const CommonReviewSetCreateSchema = z.object({
  egcs_cn_runtimeitem: IdSchema,
  egcs_cn_reviewsetsetup: IdSchema,
  egcs_cn_approvaltemplate: IdSchema.optional(),
  egcs_cn_entitytype: DirectReviewEntityTypeIdentitySchema,
  egcs_cn_entityid: IdSchema,
  egcs_cn_createdby: IdSchema
})
export const CommonReviewSetPatchSchema = CommonReviewSetCreateSchema.partial().extend({
  _deleted: z.boolean().optional()
})

const CommonReviewBaseSchema = z.object({
  egcs_cn_helpers: JsonObjectSchema.optional(),
  egcs_cn_runtimeitem: IdSchema,
  egcs_cn_reviewresult: z.coerce.number({ error: 'validation.required' }),
  egcs_cn_reviewalignment: z.boolean().optional(),
  egcs_cn_reviewalignresult: z.coerce.number({ error: 'validation.assessment_result_required' }).optional(),
  egcs_cn_reviewalignmentnarrative: z.string().optional(),
  egcs_cn_reviewset: IdSchema,
  egcs_cn_reviewschema: IdSchema,
  egcs_cn_approvaltemplate: IdSchema.optional()
})

const CommonReviewPartialSchema = CommonReviewBaseSchema.partial()

type CommonReviewAlignmentInput = z.infer<typeof CommonReviewPartialSchema>

/**
 * Enforces dependent review alignment fields when runtime alignment notes are enabled.
 *
 * @param data - Candidate common review payload.
 * @param ctx - Zod refinement context receiving validation issues.
 */
const validateCommonReviewAlignment = (
  data: CommonReviewAlignmentInput,
  ctx: z.RefinementCtx
) => {
  if (data.egcs_cn_reviewalignment !== true) {
    return
  }

  if (!data.egcs_cn_reviewalignmentnarrative?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['egcs_cn_reviewalignmentnarrative'],
      message: 'validation.required'
    })
  }

  if (data.egcs_cn_reviewalignresult === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['egcs_cn_reviewalignresult'],
      message: 'validation.assessment_result_required'
    })
  }
}

export const CommonReviewCreateSchema = CommonReviewBaseSchema.superRefine(validateCommonReviewAlignment)
export const CommonReviewPatchSchema = CommonReviewPartialSchema
  .superRefine(validateCommonReviewAlignment)
  .extend({
    _deleted: z.boolean().optional()
  })

export const CommonReviewResponseCreateSchema = z.object({
  egcs_cn_section: RequiredString('validation.section_required'),
  egcs_cn_subsection: RequiredString('validation.subsection_required'),
  egcs_cn_question: RequiredString('validation.question_required'),
  egcs_cn_value: z.coerce.number({ error: 'validation.value_required' }).int(),
  egcs_cn_comment: RequiredString('validation.comment_required'),
  egcs_cn_assessment: IdSchema
})
export const CommonReviewResponsePatchSchema = CommonReviewResponseCreateSchema.partial().extend({
  id: IdSchema.optional()
})

export const CommonRecommendationSchemaCreateSchema = z.object({
  egcs_cn_agency: IdSchema,
  egcs_cn_name_en: CatalogNameSchema('validation.name_en_required'),
  egcs_cn_name_fr: CatalogNameSchema('validation.name_fr_required'),
  egcs_cn_result: JsonObjectSchema,
  egcs_cn_recommendationschema: RecommendationDefinitionSchema
})
export const CommonRecommendationSchemaPatchSchema = CommonRecommendationSchemaCreateSchema.partial().extend({
  _deleted: z.boolean().optional()
})

const CommonRecommendationSetupBaseSchema = z.object({
  egcs_cn_order: z.coerce.number({ error: 'validation.required' }).int(),
  egcs_cn_recommendationset: IdSchema,
  egcs_cn_approvaltemplate: IdSchema.optional(),
  egcs_cn_recommendationschema: IdSchema,
  egcs_cn_failonnotrecommended: z.boolean()
})
export const CommonRecommendationSetupCreateSchema = CommonRecommendationSetupBaseSchema.extend({
  egcs_cn_failonnotrecommended: z.boolean().default(false)
})
export const CommonRecommendationSetupPatchSchema = CommonRecommendationSetupBaseSchema.partial().extend({
  _deleted: z.boolean().optional()
})

export const CommonRecommendationCreateSchema = z.object({
  egcs_cn_runtimeitem: IdSchema,
  egcs_cn_recommendationset: IdSchema,
  egcs_cn_recommendationsetup: IdSchema,
  egcs_cn_entitytype: z.enum(RECOMMENDATION_EXECUTION_ENTITY_TYPE_ENUM, { error: 'validation.required' }),
  egcs_cn_entityid: IdSchema,
  egcs_cn_response: JsonObjectSchema
})
export const CommonRecommendationPatchSchema = CommonRecommendationCreateSchema.partial().extend({
  _deleted: z.boolean().optional()
})

const CommonWorkflowSetupBaseSchema = z.object({
  egcs_cn_entitytype: createWorkflowTargetEntityTypeIdentitySchema('validation.workflow_entity_type_required'),
  egcs_cn_name_en: CatalogNameSchema('validation.name_en_required'),
  egcs_cn_name_fr: CatalogNameSchema('validation.name_fr_required'),
  egcs_cn_description_en: RequiredString('validation.desc_en_required').refine(value => !value.includes(String.fromCharCode(0)), {
    error: 'validation.invalid_text_character'
  }),
  egcs_cn_description_fr: RequiredString('validation.desc_fr_required').refine(value => !value.includes(String.fromCharCode(0)), {
    error: 'validation.invalid_text_character'
  }),
  egcs_cn_purpose: z.enum(['standard', 'approval_submission', 'risk_rating'], { error: 'validation.workflow_purpose_required' }).default('standard'),
  egcs_cn_riskratingrequired: z.boolean().default(false),
  egcs_cn_allowedstartstatuses: z.array(PositivePostgresBigintIdSchema).min(1, { error: 'validation.workflow_allowed_start_status_required' })
    .refine(statuses => new Set(statuses.map(String)).size === statuses.length, { error: 'validation.workflow_allowed_start_status_unique' }),
  egcs_cn_cancellationstatus: RequiredPostgresBigintIdSchema('validation.workflow_cancellation_status_required'),
  egcs_cn_executionfailurestatus: RequiredPostgresBigintIdSchema('validation.workflow_execution_failure_status_required'),
  egcs_cn_allowretry: z.boolean({ error: 'validation.required' })
}).strict()

/**
 * Applies cross-field Workflow purpose constraints.
 * @param data Workflow setup values to validate.
 * @param ctx Zod refinement context used to report field issues.
 */
const validateWorkflowSetup = (
  data: Partial<z.infer<typeof CommonWorkflowSetupBaseSchema>>,
  ctx: z.RefinementCtx
) => {
  if (data.egcs_cn_purpose === 'risk_rating' && !['fundingcaseagreement', 'fundingcaseamendment'].includes(data.egcs_cn_entitytype ?? '')) {
    ctx.addIssue({ code: 'custom', message: 'validation.workflow_risk_rating_entity_type', path: ['egcs_cn_entitytype'] })
  }
  if (data.egcs_cn_riskratingrequired && data.egcs_cn_purpose !== 'risk_rating') {
    ctx.addIssue({ code: 'custom', message: 'validation.workflow_risk_rating_required_purpose', path: ['egcs_cn_riskratingrequired'] })
  }
}

export const CommonWorkflowSetupCreateSchema = CommonWorkflowSetupBaseSchema.superRefine(validateWorkflowSetup)
const CommonWorkflowSetupPatchBaseSchema = CommonWorkflowSetupBaseSchema.partial().extend({
  egcs_cn_purpose: z.enum(['standard', 'approval_submission', 'risk_rating'], { error: 'validation.workflow_purpose_required' }).optional(),
  egcs_cn_riskratingrequired: z.boolean().optional(),
  _deleted: z.boolean().optional()
})
export const CommonWorkflowSetupPatchSchema = CommonWorkflowSetupPatchBaseSchema

const CommonWorkflowSetupMemberBaseSchema = z.object({
  conditions: WorkflowMemberConditionsSchema.optional(),
  egcs_cn_sequence: z.number().int().positive({ error: 'validation.workflow_member_sequence_positive' }),
  egcs_cn_materializationstatus: NullableOptionalIdSchema,
  egcs_cn_successstatus: NullableOptionalIdSchema,
  egcs_cn_failurestatus: NullableOptionalIdSchema,
  egcs_cn_setsriskrating: z.boolean().default(false),
  egcs_cn_riskreviewsetup: PositivePostgresBigintIdSchema.nullish().meta({ formRequired: false }),
  egcs_cn_allowownerredirect: z.boolean().default(false)
})

export const CommonWorkflowSetupMemberOwnerSchema = z.object({
  egcs_cn_reviewsetup: OptionalIdSchema,
  egcs_cn_recommendationsetup: OptionalIdSchema,
  egcs_cn_datacollection: OptionalIdSchema,
  egcs_cn_defaultowner: OptionalIdSchema,
  egcs_cn_defaultgroup: OptionalIdSchema
}).superRefine((data, ctx) => {
  if (data.egcs_cn_defaultowner && data.egcs_cn_defaultgroup) {
    ctx.addIssue({ code: 'custom', message: 'validation.invalid_selection', path: ['egcs_cn_defaultgroup'] })
  }
  if ([data.egcs_cn_reviewsetup, data.egcs_cn_recommendationsetup, data.egcs_cn_datacollection].filter(Boolean).length !== 1) {
    ctx.addIssue({ code: 'custom', message: 'validation.workflow_member_owner_reference', path: ['egcs_cn_reviewsetup'] })
  }
})
export const CommonWorkflowSetupMemberOwnersSchema = z.array(CommonWorkflowSetupMemberOwnerSchema).superRefine((owners, ctx) => {
  const references = owners.map(owner => `${owner.egcs_cn_reviewsetup ? 'review' : owner.egcs_cn_recommendationsetup ? 'recommendation' : 'data_collection'}:${owner.egcs_cn_reviewsetup ?? owner.egcs_cn_recommendationsetup ?? owner.egcs_cn_datacollection}`)
  if (new Set(references).size !== references.length) {
    ctx.addIssue({ code: 'custom', message: 'validation.workflow_member_owner_duplicate', path: [] })
  }
})

export const CommonWorkflowSetupMemberCreateSchema = z.discriminatedUnion('egcs_cn_kind', [
  CommonWorkflowSetupMemberBaseSchema.extend({ egcs_cn_kind: z.literal('review_set'), egcs_cn_reviewset: IdSchema, owners: CommonWorkflowSetupMemberOwnersSchema.optional() }),
  CommonWorkflowSetupMemberBaseSchema.extend({ egcs_cn_kind: z.literal('recommendation_set'), egcs_cn_recommendationset: IdSchema, owners: CommonWorkflowSetupMemberOwnersSchema.optional() }),
  CommonWorkflowSetupMemberBaseSchema.extend({ egcs_cn_kind: z.literal('data_collection'), egcs_cn_datacollection: IdSchema, owners: CommonWorkflowSetupMemberOwnersSchema.max(1).optional() }),
  CommonWorkflowSetupMemberBaseSchema.extend({ egcs_cn_kind: z.literal('approval_template'), egcs_cn_approvaltemplate: IdSchema, owners: z.array(z.never()).max(0).optional() })
]).superRefine((data, ctx) => {
  if (data.egcs_cn_kind === 'data_collection') {
    data.owners?.forEach((owner, index) => {
      if (owner.egcs_cn_datacollection !== data.egcs_cn_datacollection) {
        ctx.addIssue({ code: 'custom', message: 'validation.workflow_member_owner_reference', path: ['owners', index, 'egcs_cn_datacollection'] })
      }
    })
  }
  if (data.egcs_cn_setsriskrating && !data.egcs_cn_riskreviewsetup) {
    ctx.addIssue({ code: 'custom', message: 'validation.workflow_risk_review_required', path: ['egcs_cn_riskreviewsetup'] })
  }
  if (!data.egcs_cn_setsriskrating && data.egcs_cn_riskreviewsetup) {
    ctx.addIssue({ code: 'custom', message: 'validation.workflow_risk_review_disabled', path: ['egcs_cn_riskreviewsetup'] })
  }
  if (data.egcs_cn_setsriskrating && data.egcs_cn_kind !== 'review_set') {
    ctx.addIssue({ code: 'custom', message: 'validation.workflow_risk_review_kind', path: ['egcs_cn_setsriskrating'] })
  }
})
export const CommonWorkflowSetupMemberPatchSchema = z.object({
  conditions: WorkflowMemberConditionsSchema.optional(),
  egcs_cn_sequence: z.number().int().positive({ error: 'validation.workflow_member_sequence_positive' }).optional(),
  egcs_cn_materializationstatus: NullableOptionalIdSchema,
  egcs_cn_successstatus: NullableOptionalIdSchema,
  egcs_cn_failurestatus: NullableOptionalIdSchema,
  egcs_cn_setsriskrating: z.boolean().optional(),
  egcs_cn_riskreviewsetup: PositivePostgresBigintIdSchema.nullish().meta({ formRequired: false }),
  egcs_cn_allowownerredirect: z.boolean().optional(),
  owners: CommonWorkflowSetupMemberOwnersSchema.optional()
}).superRefine((data, ctx) => {
  if (data.egcs_cn_setsriskrating === true && data.egcs_cn_riskreviewsetup === null) {
    ctx.addIssue({ code: 'custom', message: 'validation.workflow_risk_review_required', path: ['egcs_cn_riskreviewsetup'] })
  }
  if (data.egcs_cn_setsriskrating === false && data.egcs_cn_riskreviewsetup) {
    ctx.addIssue({ code: 'custom', message: 'validation.workflow_risk_review_disabled', path: ['egcs_cn_riskreviewsetup'] })
  }
})
