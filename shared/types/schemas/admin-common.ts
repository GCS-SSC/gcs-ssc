import { WorkflowMemberConditionsSchema } from './agreement-custom-fields'
import { z } from 'zod'
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
}, z.coerce.string({ error: 'validation.id_required' }).min(1, { error: 'validation.id_required' }))
const RequiredIdSchema = (key: string) => z.preprocess(value => {
  if (value === undefined || value === null) return ''
  return value
}, z.coerce.string({ error: key }).min(1, { error: key }))
const OptionalIdSchema = z.preprocess(value => {
  if (value === undefined || value === null || value === '') return undefined
  return value
}, z.coerce.string().min(1).optional())
const NullableOptionalIdSchema = z.preprocess(value => {
  if (value === undefined || value === '') return undefined
  if (value === null) return null
  return value
}, z.union([z.coerce.string().min(1), z.null()]).optional())
const RequiredString = (key: string) => z.string({ error: key }).min(1, { error: key })
const OptionalNumericString = z.coerce.number().optional()
const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema)])
)
const JsonObjectSchema = z.record(z.string(), JsonValueSchema)
export const COMMON_APPROVAL_TEMPLATE_SCOPE_TYPE_ENUM = ['fundingopportunity', 'transferpaymentstream'] as const
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
const OptionalNumberSchema = z.preprocess(value => {
  if (isEmptyFilterValue(value)) return undefined
  return value
}, z.coerce.number().optional())
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
  search: z.string().optional(),
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

export const CommonGwcoaCreateSchema = z.object({
  egcs_cn_number: z.coerce.number({ error: 'validation.required' })
    .int({ error: 'validation.invalid_number' })
    .min(0, { error: 'validation.invalid_number' })
    .max(32767, { error: 'validation.invalid_number' }),
  egcs_cn_name_en: RequiredString('validation.name_en_required'),
  egcs_cn_name_fr: RequiredString('validation.name_fr_required')
})
export const CommonGwcoaPatchSchema = CommonGwcoaCreateSchema.partial().extend({ _deleted: z.boolean().optional() })

export const CommonContactCreateSchema = z.object({
  egcs_cn_title: z.string().optional(),
  egcs_cn_name: RequiredString('validation.name_required'),
  egcs_cn_businessphone: OptionalNumericString,
  egcs_cn_businessphoneextension: OptionalNumericString,
  egcs_cn_generallanguagepreference: z.enum(LANGUAGE_PREFERENCE_ENUM, { error: 'validation.language_required' }),
  egcs_cn_jobtitle_en: RequiredString('validation.job_title_en_required'),
  egcs_cn_jobtitle_fr: RequiredString('validation.job_title_fr_required'),
  egcs_cn_primaryaccount: z.boolean({ error: 'validation.primary_account_required' }),
  egcs_cn_email: RequiredString('validation.email_required')
})
export const CommonContactPatchSchema = CommonContactCreateSchema.partial().extend({ _deleted: z.boolean().optional() })

const CommonAddressBaseSchema = z.object({
  egcs_cn_federalridingid: z.coerce.number({ error: 'validation.federal_riding_id_required' }).int(),
  egcs_cn_addresscity: RequiredString('validation.city_required'),
  egcs_cn_addresscountry: z.enum(COUNTRIES_ENUM),
  egcs_cn_addresssubdivision: RequiredString('validation.required'),
  egcs_cn_gc_addressid: OptionalNumberSchema,
  egcs_cn_latitude: z.coerce.number().optional(),
  egcs_cn_longitude: z.coerce.number().optional(),
  egcs_cn_mainphone: z.coerce.number({ error: 'validation.main_phone_required' }),
  egcs_cn_mainphoneextension: z.coerce.number().int().optional(),
  egcs_cn_postalcodezipcode: RequiredString('validation.postal_code_required'),
  egcs_cn_street1: RequiredString('validation.street1_required'),
  egcs_cn_street2: z.string().optional(),
  egcs_cn_street3: z.string().optional()
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
  egcs_cn_completedat: z.coerce.date({ error: 'validation.required' })
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
  egcs_cn_scopetype: z.enum(COMMON_APPROVAL_TEMPLATE_SCOPE_TYPE_ENUM, { error: 'validation.required' }),
  egcs_cn_scopeid: IdSchema,
  egcs_cn_description_en: RequiredString('validation.desc_en_required'),
  egcs_cn_description_fr: RequiredString('validation.desc_fr_required'),
  egcs_cn_name_en: RequiredString('validation.name_en_required'),
  egcs_cn_name_fr: RequiredString('validation.name_fr_required')
})
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
  egcs_cn_name_en: RequiredString('validation.name_en_required'),
  egcs_cn_name_fr: RequiredString('validation.name_fr_required'),
  egcs_cn_description_en: RequiredString('validation.desc_en_required'),
  egcs_cn_description_fr: RequiredString('validation.desc_fr_required')
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
export const CommonReviewSchemaPatchSchema = CommonReviewSchemaCreateSchema.omit({
  egcs_cn_entitytype: true
}).partial().extend({
  _deleted: z.boolean().optional()
})

export const CommonReviewSetSetupCreateSchema = z.object({
  egcs_cn_scopetype: z.enum(SCOPE_ENTITY_TYPE_ENUM, { error: 'validation.required' }),
  egcs_cn_scopeid: IdSchema,
  egcs_cn_entitytype: DirectReviewEntityTypeIdentitySchema,
  egcs_cn_name_en: RequiredString('validation.name_en_required'),
  egcs_cn_name_fr: RequiredString('validation.name_fr_required'),
  egcs_cn_order: z.coerce.number({ error: 'validation.required' }).int(),
  egcs_cn_sequential: z.boolean({ error: 'validation.required' })
})
export const CommonReviewSetSetupPatchSchema = CommonReviewSetSetupCreateSchema.partial().extend({
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

export const CommonApprovalsSetupCreateSchema = z.object({
  egcs_cn_scopetype: z.enum(SCOPE_ENTITY_TYPE_ENUM, { error: 'validation.required' }),
  egcs_cn_scopeid: IdSchema,
  egcs_cn_entitytype: z.enum(EXECUTION_ENTITY_TYPE_ENUM, { error: 'validation.required' }),
  egcs_cn_approvaltemplate: IdSchema
})
export const CommonApprovalsSetupPatchSchema = CommonApprovalsSetupCreateSchema.partial().extend({
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
  egcs_cn_name_en: RequiredString('validation.name_en_required'),
  egcs_cn_name_fr: RequiredString('validation.name_fr_required'),
  egcs_cn_result: JsonObjectSchema,
  egcs_cn_recommendationschema: RecommendationDefinitionSchema
})
export const CommonRecommendationSchemaPatchSchema = CommonRecommendationSchemaCreateSchema.partial().extend({
  _deleted: z.boolean().optional()
})

export const CommonRecommendationSetSetupCreateSchema = z.object({
  egcs_cn_scopetype: z.enum(SCOPE_ENTITY_TYPE_ENUM, { error: 'validation.required' }),
  egcs_cn_scopeid: IdSchema,
  egcs_cn_name_en: RequiredString('validation.name_en_required'),
  egcs_cn_name_fr: RequiredString('validation.name_fr_required'),
  egcs_cn_description_en: RequiredString('validation.desc_en_required'),
  egcs_cn_description_fr: RequiredString('validation.desc_fr_required'),
  egcs_cn_approvaltemplate: IdSchema.optional()
})
export const CommonRecommendationSetSetupPatchSchema = CommonRecommendationSetSetupCreateSchema.partial().extend({
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
  egcs_cn_scopetype: z.enum(SCOPE_ENTITY_TYPE_ENUM, { error: 'validation.required' }),
  egcs_cn_scopeid: IdSchema,
  egcs_cn_entitytype: createWorkflowTargetEntityTypeIdentitySchema('validation.workflow_entity_type_required'),
  egcs_cn_name_en: RequiredString('validation.name_en_required'),
  egcs_cn_name_fr: RequiredString('validation.name_fr_required'),
  egcs_cn_description_en: RequiredString('validation.desc_en_required'),
  egcs_cn_description_fr: RequiredString('validation.desc_fr_required'),
  egcs_cn_purpose: z.enum(['standard', 'approval_submission', 'risk_rating'], { error: 'validation.workflow_purpose_required' }).default('standard'),
  egcs_cn_allowedstartstatuses: z.array(IdSchema).min(1, { error: 'validation.workflow_allowed_start_status_required' })
    .refine(statuses => new Set(statuses.map(String)).size === statuses.length, { error: 'validation.workflow_allowed_start_status_unique' }),
  egcs_cn_cancellationstatus: RequiredIdSchema('validation.workflow_cancellation_status_required'),
  egcs_cn_executionfailurestatus: RequiredIdSchema('validation.workflow_execution_failure_status_required'),
  egcs_cn_allowretry: z.boolean({ error: 'validation.required' })
})

/**
 * Applies cross-field Workflow purpose constraints.
 * @param data Workflow setup values to validate.
 * @param ctx Zod refinement context used to report field issues.
 */
const validateWorkflowSetup = (
  data: Partial<z.infer<typeof CommonWorkflowSetupBaseSchema>>,
  ctx: z.RefinementCtx
) => {
  if (data.egcs_cn_scopetype !== undefined && data.egcs_cn_scopetype !== 'transferpaymentstream') {
    ctx.addIssue({ code: 'custom', message: 'validation.workflow_scope_transfer_payment_stream', path: ['egcs_cn_scopetype'] })
  }
  if (data.egcs_cn_purpose === 'approval_submission') {
    if (data.egcs_cn_scopetype !== 'transferpaymentstream') {
      ctx.addIssue({ code: 'custom', message: 'validation.workflow_approval_submission_scope', path: ['egcs_cn_scopetype'] })
    }
  }
  if (data.egcs_cn_purpose === 'risk_rating' && data.egcs_cn_entitytype !== 'fundingcaseagreement') {
    ctx.addIssue({ code: 'custom', message: 'validation.workflow_risk_rating_entity_type', path: ['egcs_cn_entitytype'] })
  }
}

export const CommonWorkflowSetupCreateSchema = CommonWorkflowSetupBaseSchema.superRefine(validateWorkflowSetup)
const CommonWorkflowSetupPatchBaseSchema = CommonWorkflowSetupBaseSchema.partial().extend({
  _deleted: z.boolean().optional()
})
export const CommonWorkflowSetupPatchSchema = CommonWorkflowSetupPatchBaseSchema

const CommonWorkflowSetupMemberBaseSchema = z.object({
  conditions: WorkflowMemberConditionsSchema.optional(),
  egcs_cn_sequence: z.number().int().positive({ error: 'validation.workflow_member_sequence_positive' }),
  egcs_cn_materializationstatus: NullableOptionalIdSchema,
  egcs_cn_successstatus: NullableOptionalIdSchema,
  egcs_cn_failurestatus: NullableOptionalIdSchema,
  egcs_cn_allowownerredirect: z.boolean().default(false)
})

export const CommonWorkflowSetupMemberOwnerSchema = z.object({
  egcs_cn_reviewsetup: OptionalIdSchema,
  egcs_cn_recommendationsetup: OptionalIdSchema,
  egcs_cn_defaultowner: OptionalIdSchema
}).superRefine((data, ctx) => {
  if (Number(Boolean(data.egcs_cn_reviewsetup)) + Number(Boolean(data.egcs_cn_recommendationsetup)) !== 1) {
    ctx.addIssue({ code: 'custom', message: 'validation.workflow_member_owner_reference', path: ['egcs_cn_reviewsetup'] })
  }
})
export const CommonWorkflowSetupMemberOwnersSchema = z.array(CommonWorkflowSetupMemberOwnerSchema).superRefine((owners, ctx) => {
  const references = owners.map(owner => `${owner.egcs_cn_reviewsetup ? 'review' : 'recommendation'}:${owner.egcs_cn_reviewsetup ?? owner.egcs_cn_recommendationsetup}`)
  if (new Set(references).size !== references.length) {
    ctx.addIssue({ code: 'custom', message: 'validation.workflow_member_owner_duplicate', path: [] })
  }
})

export const CommonWorkflowSetupMemberCreateSchema = z.discriminatedUnion('egcs_cn_kind', [
  CommonWorkflowSetupMemberBaseSchema.extend({ egcs_cn_kind: z.literal('review_set'), egcs_cn_reviewset: IdSchema, owners: CommonWorkflowSetupMemberOwnersSchema.optional() }),
  CommonWorkflowSetupMemberBaseSchema.extend({ egcs_cn_kind: z.literal('recommendation_set'), egcs_cn_recommendationset: IdSchema, owners: CommonWorkflowSetupMemberOwnersSchema.optional() }),
  CommonWorkflowSetupMemberBaseSchema.extend({ egcs_cn_kind: z.literal('approval_template'), egcs_cn_approvaltemplate: IdSchema, owners: z.array(z.never()).max(0).optional() })
])
export const CommonWorkflowSetupMemberPatchSchema = z.object({
  conditions: WorkflowMemberConditionsSchema.optional(),
  egcs_cn_sequence: z.number().int().positive({ error: 'validation.workflow_member_sequence_positive' }).optional(),
  egcs_cn_materializationstatus: NullableOptionalIdSchema,
  egcs_cn_successstatus: NullableOptionalIdSchema,
  egcs_cn_failurestatus: NullableOptionalIdSchema,
  egcs_cn_allowownerredirect: z.boolean().optional(),
  owners: CommonWorkflowSetupMemberOwnersSchema.optional()
})
