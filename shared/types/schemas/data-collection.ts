import { z } from 'zod'
import { SYSTEM_LIFECYCLE } from '../../constants/system-lifecycle'
import { PaginationSchema, PositivePostgresBigintIdSchema } from './common'
import { QuestionnaireDefinitionSchema, QuestionnaireResponsesSchema } from './questionnaire'

export const DataCollectionDefinitionSchema = QuestionnaireDefinitionSchema
export const DataCollectionListQuerySchema = PaginationSchema.extend({
  state: z.enum(SYSTEM_LIFECYCLE.publication.states, { error: 'validation.invalid_selection' }).optional()
}).strict()
const RequiredNameSchema = z.string().trim().min(1, { error: 'validation.required' }).max(255, { error: 'validation.max_length' })
const OptionalApprovalIdSchema = z.preprocess(
  value => value === '' || value === undefined ? undefined : value,
  PositivePostgresBigintIdSchema.nullable().optional()
).meta({ formRequired: false })

export const DataCollectionSetupBaseSchema = z.strictObject({
  egcs_cn_name_en: RequiredNameSchema,
  egcs_cn_name_fr: RequiredNameSchema,
  egcs_cn_description_en: z.string().trim().min(1, { error: 'validation.required' }),
  egcs_cn_description_fr: z.string().trim().min(1, { error: 'validation.required' }),
  egcs_cn_schema: DataCollectionDefinitionSchema,
  egcs_cn_approvaltemplate: OptionalApprovalIdSchema
}, { error: 'validation.invalid_selection' })
export const DataCollectionSetupCreateSchema = DataCollectionSetupBaseSchema
export const DataCollectionSetupPatchSchema = DataCollectionSetupBaseSchema.partial()
export const DataCollectionSaveSchema = z.strictObject({
  revision: z.number().int().min(1, { error: 'validation.invalid_number' }),
  responses: QuestionnaireResponsesSchema
}, { error: 'validation.invalid_selection' })

export type DataCollectionDefinition = z.infer<typeof DataCollectionDefinitionSchema>
export type DataCollectionSetupCreate = z.infer<typeof DataCollectionSetupCreateSchema>
export type DataCollectionSetupPatch = z.infer<typeof DataCollectionSetupPatchSchema>
export type DataCollectionSave = z.infer<typeof DataCollectionSaveSchema>
