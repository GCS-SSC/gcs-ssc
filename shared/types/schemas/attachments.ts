import { z } from 'zod'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { PaginationSchema, RequiredStringId } from './common'

const AttachmentTypeIdSchema = RequiredStringId().refine(isPositivePostgresBigintText, {
  message: 'validation.invalid_selection'
})

export const ATTACHMENT_TARGET_ENTITY_TYPES = [
  'applicantrecipient',
  'fundingcaseagreement',
  'fundingcaseamendment',
  'fundingcaseagreementclaim',
  'fundingclaimreconcile',
  'fundingcaseagreementcommitment',
  'fundingcaseforecast',
  'fundingcasemonitor',
  'fundingcasepayment',
  'fundingcaseagreementcloseout'
] as const

export const AttachmentTargetEntityTypeSchema = z.enum(ATTACHMENT_TARGET_ENTITY_TYPES, {
  error: 'validation.invalid_selection'
})

export const AttachmentTargetSchema = z.object({
  entityType: AttachmentTargetEntityTypeSchema,
  entityId: RequiredStringId().refine(isPositivePostgresBigintText, {
    message: 'validation.invalid_selection'
  })
})

export const AttachmentListQuerySchema = PaginationSchema.extend({
  attachmentTypeId: AttachmentTypeIdSchema.optional()
})

export const AttachmentTypeLookupQuerySchema = z.object({
  search: z.string().trim().max(255).optional(),
  ids: z.union([AttachmentTypeIdSchema, z.array(AttachmentTypeIdSchema).max(20)]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
})

export const AttachmentMetadataBaseSchema = z.object({
  attachmentTypeId: AttachmentTypeIdSchema,
  nameEn: z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' }).max(255),
  nameFr: z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' }).max(255),
  descriptionEn: z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' }).max(10_000),
  descriptionFr: z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' }).max(10_000),
  providerMetadata: z.record(z.string(), z.json()).optional()
})

export const AttachmentUploadMetadataSchema = AttachmentMetadataBaseSchema
export const AttachmentPatchSchema = AttachmentMetadataBaseSchema.partial().refine(
  value => Object.keys(value).length > 0,
  { error: 'validation.required' }
)

export const AgencyStorageProviderSelectionSchema = z.object({
  providerKey: z.string({ error: 'validation.required' })
    .min(1, { error: 'validation.required' })
    .max(120)
    .regex(/^[a-z][a-z0-9-]*$/, { error: 'validation.invalid_extension_key' })
})

export type AttachmentTargetEntityType = z.infer<typeof AttachmentTargetEntityTypeSchema>
export type AttachmentTarget = z.infer<typeof AttachmentTargetSchema>
export type AttachmentUploadMetadata = z.infer<typeof AttachmentUploadMetadataSchema>
export type AttachmentPatch = z.infer<typeof AttachmentPatchSchema>
