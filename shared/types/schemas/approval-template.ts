/* eslint-disable jsdoc/require-jsdoc */
import { z } from 'zod'
import type { PublicationState } from '../../constants/system-lifecycle'
import {
  createApprovalTemplateCertificationBaseSchema,
  createApprovalTemplateStepBaseSchema,
  validateApprovalTemplateCertifications,
  validateApprovalTemplatePatchCertifications,
  validateApprovalTemplateStepSequences
} from './approval-template-common'
import { PaginationSchema } from './common'

type WithId<T> = T & { id: string }

const RequiredId = () => z.preprocess(value => {
  if (value === undefined || value === null) {
    return ''
  }

  return value
}, z.coerce.string({ error: 'validation.id_required' }).min(1, { error: 'validation.id_required' }))

const RequiredString = () => z.string({ error: 'validation.required' }).min(1, { error: 'validation.required' })

export const APPROVAL_TEMPLATE_SCOPE_TYPE_ENUM = ['transferpaymentstream'] as const

export const ApprovalTemplateScopeTypeSchema = z.enum(APPROVAL_TEMPLATE_SCOPE_TYPE_ENUM, {
  error: 'validation.required'
})

export const ApprovalTemplateCertificationBaseSchema = createApprovalTemplateCertificationBaseSchema(RequiredString)

export const ApprovalTemplateCertificationSchema = ApprovalTemplateCertificationBaseSchema
export const ApprovalTemplateCertificationPatchSchema = ApprovalTemplateCertificationBaseSchema.partial().extend({
  id: RequiredId().optional(),
  _deleted: z.boolean().optional()
})

export type ApprovalTemplateCertification = z.infer<typeof ApprovalTemplateCertificationSchema>
export type ApprovalTemplateCertificationItem = WithId<ApprovalTemplateCertification>
export const AdditionalApprovalCertificationBaseSchema = ApprovalTemplateCertificationBaseSchema

export const AdditionalApprovalCertificationSchema = AdditionalApprovalCertificationBaseSchema
export const AdditionalApprovalCertificationPatchSchema = AdditionalApprovalCertificationBaseSchema.partial().extend({
  id: RequiredId().optional(),
  _deleted: z.boolean().optional()
})

export type AdditionalApprovalCertification = z.infer<typeof AdditionalApprovalCertificationSchema>
export type AdditionalApprovalCertificationItem = WithId<AdditionalApprovalCertification>

export const ApprovalTemplateStepBaseSchema = createApprovalTemplateStepBaseSchema(
  ApprovalTemplateCertificationSchema,
  RequiredId,
  RequiredString
)

export const ApprovalTemplateStepSchema = ApprovalTemplateStepBaseSchema.superRefine((data, ctx) => {
  validateApprovalTemplateCertifications(data.certifications, ctx)
})

export const ApprovalTemplateStepPatchSchema = ApprovalTemplateStepBaseSchema
  .partial()
  .extend({
    id: RequiredId().optional(),
    certifications: z.array(ApprovalTemplateCertificationPatchSchema).optional(),
    _deleted: z.boolean().optional()
  })
  .superRefine((data, ctx) => {
    validateApprovalTemplatePatchCertifications(data.certifications, ctx)
  })

export type ApprovalTemplateStep = z.infer<typeof ApprovalTemplateStepSchema>
export type ApprovalTemplateStepItem = Omit<WithId<ApprovalTemplateStep>, 'certifications'> & {
  certifications: ApprovalTemplateCertificationItem[]
}

const ApprovalTemplateBaseSchema = z.object({
  egcs_cn_description_en: RequiredString(),
  egcs_cn_description_fr: RequiredString(),
  egcs_cn_name_en: RequiredString(),
  egcs_cn_name_fr: RequiredString(),
  egcs_cn_allowadditionalapprovals: z.boolean().default(false),
  egcs_cn_defaultaddedapprovalname_en: RequiredString().optional(),
  egcs_cn_defaultaddedapprovalname_fr: RequiredString().optional(),
  egcs_cn_allowaddedapprovalnamechanges: z.boolean().default(false),
  egcs_cn_allowaddedapprovalcertificationchanges: z.boolean().default(false),
  additionalApprovalCertifications: z.array(AdditionalApprovalCertificationSchema).default([]),
  steps: z.array(ApprovalTemplateStepSchema).default([])
})

type AdditionalApprovalPolicy = {
  egcs_cn_allowadditionalapprovals?: boolean
  egcs_cn_defaultaddedapprovalname_en?: string
  egcs_cn_defaultaddedapprovalname_fr?: string
  additionalApprovalCertifications?: Array<{ egcs_cn_order?: number; _deleted?: boolean }>
}

const validateAdditionalApprovalPolicy = (
  data: AdditionalApprovalPolicy,
  ctx: z.RefinementCtx
) => {
  if (data.egcs_cn_allowadditionalapprovals) {
    if (!data.egcs_cn_defaultaddedapprovalname_en) {
      ctx.addIssue({ code: 'custom', message: 'validation.required', path: ['egcs_cn_defaultaddedapprovalname_en'] })
    }
    if (!data.egcs_cn_defaultaddedapprovalname_fr) {
      ctx.addIssue({ code: 'custom', message: 'validation.required', path: ['egcs_cn_defaultaddedapprovalname_fr'] })
    }
  }

  const orders = new Set<number>()
  for (const [index, certification] of (data.additionalApprovalCertifications ?? []).entries()) {
    if (certification._deleted || certification.egcs_cn_order === undefined) continue
    if (orders.has(certification.egcs_cn_order)) {
      ctx.addIssue({
        code: 'custom',
        message: 'validation.invalid_selection',
        path: ['additionalApprovalCertifications', index, 'egcs_cn_order']
      })
    }
    orders.add(certification.egcs_cn_order)
  }
}

export const ApprovalTemplateSchema = ApprovalTemplateBaseSchema.superRefine((data, ctx) => {
  validateApprovalTemplateStepSequences(data, ctx)
  validateAdditionalApprovalPolicy(data, ctx)
})

export const ApprovalTemplateCreateSchema = ApprovalTemplateBaseSchema
  .extend({
    scopeType: ApprovalTemplateScopeTypeSchema,
    scopeId: RequiredId()
  })
  .superRefine((data, ctx) => {
    validateApprovalTemplateStepSequences(data, ctx)
    validateAdditionalApprovalPolicy(data, ctx)
  })

export const ApprovalTemplatePatchSchema = ApprovalTemplateBaseSchema
  .partial()
  .extend({
    egcs_cn_allowadditionalapprovals: z.boolean().optional(),
    egcs_cn_allowaddedapprovalnamechanges: z.boolean().optional(),
    egcs_cn_allowaddedapprovalcertificationchanges: z.boolean().optional(),
    steps: z.array(ApprovalTemplateStepPatchSchema).optional(),
    additionalApprovalCertifications: z.array(AdditionalApprovalCertificationPatchSchema).optional(),
    _deleted: z.boolean().optional()
  })
  .superRefine((data, ctx) => {
    validateApprovalTemplateStepSequences(data, ctx)
  })

const ApprovalTemplateDeletedCertificationSchema = z.object({
  id: RequiredId(),
  _deleted: z.literal(true)
})

const ApprovalTemplatePersistenceCertificationSchema = z.union([
  ApprovalTemplateCertificationBaseSchema.extend({
    id: RequiredId().optional(),
    _deleted: z.literal(false).optional()
  }),
  ApprovalTemplateDeletedCertificationSchema
])

const ApprovalTemplatePersistenceStepActiveSchema = createApprovalTemplateStepBaseSchema(
  ApprovalTemplatePersistenceCertificationSchema,
  RequiredId,
  RequiredString
).extend({
  id: RequiredId().optional(),
  _deleted: z.literal(false).optional()
}).superRefine((data, ctx) => {
  validateApprovalTemplatePatchCertifications(data.certifications, ctx)
})

const ApprovalTemplatePersistenceStepSchema = z.union([
  ApprovalTemplatePersistenceStepActiveSchema,
  z.object({
    id: RequiredId(),
    _deleted: z.literal(true)
  })
])

const AdditionalApprovalPersistenceCertificationSchema = z.union([
  AdditionalApprovalCertificationBaseSchema.extend({
    id: RequiredId().optional(),
    _deleted: z.literal(false).optional()
  }),
  z.object({
    id: RequiredId(),
    _deleted: z.literal(true)
  })
])

/** Full template fields with parent-merged children retained for aggregate persistence. */
export const ApprovalTemplatePersistenceSchema = ApprovalTemplateBaseSchema
  .omit({ steps: true, additionalApprovalCertifications: true })
  .extend({
    steps: z.array(ApprovalTemplatePersistenceStepSchema),
    additionalApprovalCertifications: z.array(AdditionalApprovalPersistenceCertificationSchema).default([])
  })
  .superRefine((data, ctx) => {
    validateApprovalTemplateStepSequences(data, ctx)
    validateAdditionalApprovalPolicy(data, ctx)
  })

export const ApprovalTemplateListQuerySchema = PaginationSchema.extend({
  scopeType: ApprovalTemplateScopeTypeSchema,
  scopeId: RequiredId()
})

export type ApprovalTemplate = z.infer<typeof ApprovalTemplateSchema>
export type ApprovalTemplateScopeType = z.infer<typeof ApprovalTemplateScopeTypeSchema>
export type ApprovalTemplateCreateInput = z.infer<typeof ApprovalTemplateCreateSchema>
export type ApprovalTemplatePatch = z.infer<typeof ApprovalTemplatePatchSchema>
export type ApprovalTemplatePersistence = z.infer<typeof ApprovalTemplatePersistenceSchema>
export type ApprovalTemplateListQueryInput = z.infer<typeof ApprovalTemplateListQuerySchema>
export type ApprovalTemplateItem = Omit<WithId<ApprovalTemplate>, 'steps' | 'additionalApprovalCertifications'> & {
  steps: ApprovalTemplateStepItem[]
  additionalApprovalCertifications: AdditionalApprovalCertificationItem[]
  publicationId: string
  publicationState: PublicationState
  publicationVersionId: string | null
  publicationVersion: number | null
  hasUnpublishedChanges: boolean
}
