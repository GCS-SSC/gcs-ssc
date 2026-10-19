import { z } from 'zod'
import { GuideDraftSchema } from '@gcs-ssc/guided-help/contracts'
import { PositivePostgresBigintIdSchema } from './common'

const id = PositivePostgresBigintIdSchema
const keys = z.array(z.string({ error: 'validation.required' }).min(1, { error: 'validation.required' }).max(160, { error: 'validation.guided_help_document_invalid' })).min(1, { error: 'validation.required' }).max(100, { error: 'validation.guided_help_document_invalid' }).refine(value => new Set(value).size === value.length, 'validation.guided_help_duplicate_key')
const roles = z.array(id).min(1, { error: 'validation.required' }).max(1000, { error: 'validation.guided_help_document_invalid' }).refine(value => new Set(value).size === value.length, 'validation.guided_help_duplicate_key')
export const GuidedHelpCreateSchema = z.strictObject({ egcs_cn_document: GuideDraftSchema, egcs_cn_shared: z.boolean().optional() })
export const GuidedHelpCatalogSettingsSchema = z.strictObject({ egcs_ay_sourceversion: id, egcs_ay_discoveryscreens: keys, egcs_ay_roles: roles })
export const GuidedHelpAdoptSchema = GuidedHelpCatalogSettingsSchema.extend({ egcs_ay_guide: id })
export const GuidedHelpCloneSchema = z.strictObject({ sourceVersionId: id })
export const GuidedHelpLaunchSchema = z.strictObject({ view: z.string({ error: 'validation.required' }).min(1, { error: 'validation.required' }).max(160, { error: 'validation.guided_help_document_invalid' }), reviewId: id.optional(), agreementId: id.optional() })
