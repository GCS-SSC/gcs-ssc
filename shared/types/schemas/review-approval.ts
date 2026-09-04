/* eslint-disable jsdoc/require-jsdoc -- schema declarations and preprocessors are self-describing */
import { z } from 'zod'
import { isPositivePostgresBigintText } from '../../utils/database-id'
import { EXECUTION_ENTITY_TYPE_ENUM } from './admin-common'
import { ApprovalTemplateCertificationBaseSchema } from './approval-template'
import { EntityTypeIdentitySchema, OptionalNullableTrimmedString, PaginationSchema, RequiredStringId } from './common'

const OptionalNullableId = () =>
  z.preprocess(
    value => {
      if (value === undefined) {
        return undefined
      }

      if (value === null || value === '') {
        return null
      }

      return String(value)
    },
    z.union([
      z.string({ error: 'validation.required' }).min(1, { error: 'validation.required' }),
      z.null()
    ]).optional()
  )
export const ReviewApprovalActionCertificationSchema = z.object({
  id: RequiredStringId(),
  egcs_cn_value: z.boolean({ error: 'validation.required' })
})

const ReviewApprovalActionBaseSchema = z.object({
  approvalId: RequiredStringId(),
  egcs_cn_onbehalf: OptionalNullableId(),
  egcs_cn_approvalpositiontitle: OptionalNullableTrimmedString(),
  egcs_cn_approvaldate: z.preprocess(
    value => (value === undefined || value === null || value === '' ? undefined : value),
    z.coerce.date().optional()
  ),
  egcs_cn_comment: OptionalNullableTrimmedString(),
  certifications: z.array(ReviewApprovalActionCertificationSchema).default([])
}).transform((data) => {
  if (data.egcs_cn_onbehalf) {
    return data
  }

  const {
    egcs_cn_approvalpositiontitle: _approvalPositionTitle,
    ...nextData
  } = data

  return {
    ...nextData
  }
})

export const ReviewApprovalApproveSchema = ReviewApprovalActionBaseSchema

export const ReviewApprovalDenySchema = ReviewApprovalActionBaseSchema.superRefine((data, ctx) => {
  if (!data.egcs_cn_comment) {
    ctx.addIssue({
      code: 'custom',
      message: 'validation.required',
      path: ['egcs_cn_comment']
    })
  }
})

export const ReviewApprovalDecisionEvidenceSchema = z.object({
  egcs_cn_defaultuser: RequiredStringId(),
  egcs_cn_assigneduser: RequiredStringId(),
  egcs_cn_onbehalf: OptionalNullableId(),
  egcs_ay_require_actual: z.boolean(),
  egcs_cn_approvalpositiontitle: OptionalNullableTrimmedString(),
  egcs_cn_approvaldate: z.date().optional()
}).superRefine((data, ctx) => {
  const isDelegated = data.egcs_cn_assigneduser !== data.egcs_cn_defaultuser
  if (isDelegated && !data.egcs_cn_onbehalf) {
    ctx.addIssue({
      code: 'custom',
      message: 'validation.review_approval_on_behalf_required',
      path: ['egcs_cn_onbehalf']
    })
    return
  }
  if (!isDelegated && data.egcs_cn_onbehalf) {
    ctx.addIssue({
      code: 'custom',
      message: 'validation.review_approval_on_behalf_not_allowed',
      path: ['egcs_cn_onbehalf']
    })
    return
  }
  if (!data.egcs_ay_require_actual) {
    return
  }
  if (!data.egcs_cn_approvalpositiontitle) {
    ctx.addIssue({
      code: 'custom',
      message: 'validation.approval_position_required',
      path: ['egcs_cn_approvalpositiontitle']
    })
  }
  if (!data.egcs_cn_approvaldate) {
    ctx.addIssue({
      code: 'custom',
      message: 'validation.approval_date_required',
      path: ['egcs_cn_approvaldate']
    })
  }
})

export const ReviewApprovalReassignSchema = z.object({
  approvalId: RequiredStringId(),
  egcs_cn_assigneduser: RequiredStringId(),
  egcs_cn_onbehalf: OptionalNullableId()
})

export const AdditionalApprovalInputCertificationSchema = ApprovalTemplateCertificationBaseSchema

const ApprovalRuntimeEntityTypeSchema = EntityTypeIdentitySchema.refine(
  value => value.includes(':') || (EXECUTION_ENTITY_TYPE_ENUM as readonly string[]).includes(value),
  { error: 'validation.invalid_selection' }
)

export const AddApprovalStepSchema = z.object({
  entityType: ApprovalRuntimeEntityTypeSchema,
  entityId: RequiredStringId(),
  anchorApprovalId: RequiredStringId()
    .refine(isPositivePostgresBigintText, { error: 'validation.invalid_selection' }),
  position: z.enum(['before', 'after'], { error: 'validation.required' }),
  egcs_cn_assigneduser: RequiredStringId(),
  egcs_cn_name_en: z.string().trim().min(1, { error: 'validation.required' }).optional(),
  egcs_cn_name_fr: z.string().trim().min(1, { error: 'validation.required' }).optional(),
  certifications: z.array(AdditionalApprovalInputCertificationSchema).optional()
}).superRefine((data, ctx) => {
  const orders = new Set<number>()
  for (const [index, certification] of (data.certifications ?? []).entries()) {
    if (orders.has(certification.egcs_cn_order)) {
      ctx.addIssue({
        code: 'custom',
        message: 'validation.invalid_selection',
        path: ['certifications', index, 'egcs_cn_order']
      })
    }
    orders.add(certification.egcs_cn_order)
  }
})

export const ApprovalRuntimeEntitySchema = z.object({
  entityType: ApprovalRuntimeEntityTypeSchema,
  entityId: RequiredStringId()
})

export const ApprovalRuntimeQuerySchema = PaginationSchema.extend({
  entityType: ApprovalRuntimeEntityTypeSchema,
  entityId: RequiredStringId()
})

export type ReviewApprovalActionCertificationInput = z.infer<typeof ReviewApprovalActionCertificationSchema>
export type ReviewApprovalApproveInput = z.infer<typeof ReviewApprovalApproveSchema>
export type ReviewApprovalDenyInput = z.infer<typeof ReviewApprovalDenySchema>
export type ReviewApprovalDecisionEvidenceInput = z.infer<typeof ReviewApprovalDecisionEvidenceSchema>
export type ReviewApprovalReassignInput = z.infer<typeof ReviewApprovalReassignSchema>
export type AddApprovalStepInput = z.infer<typeof AddApprovalStepSchema>
export type ApprovalRuntimeEntityInput = z.infer<typeof ApprovalRuntimeEntitySchema>
export type ApprovalRuntimeQueryInput = z.infer<typeof ApprovalRuntimeQuerySchema>
