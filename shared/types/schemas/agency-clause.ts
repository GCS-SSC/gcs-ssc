import { z } from 'zod'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'
import { PositivePostgresBigintIdSchema } from './common'
import { LanguageIndependentCodeSchema } from './language-independent-code'

const ClauseOrderSchema = z.int({ error: 'validation.invalid_number' })
  .min(0, { error: 'validation.invalid_number' }).max(2147483647, { error: 'validation.invalid_number' })
const ClauseNameSchema = z.string().trim()
  .max(255, { error: 'validation.max_length' })
const ClauseTextSchema = z.string().trim()
const DraftClauseNameSchema = ClauseNameSchema.meta({ formRequired: false })
const DraftClauseTextSchema = ClauseTextSchema.meta({ formRequired: false })
const RequiredClauseTextSchema = ClauseTextSchema.min(1, { error: 'validation.required' })

export const AgencyClauseTextSchema = z.object({
  id: PositivePostgresBigintIdSchema.optional(),
  egcs_ay_clause_en: DraftClauseTextSchema,
  egcs_ay_clause_fr: DraftClauseTextSchema,
  egcs_ay_displayorder: ClauseOrderSchema
}).strict()

export const AgencyClauseUpdateSchema = z.object({
  egcs_ay_name_en: DraftClauseNameSchema,
  egcs_ay_name_fr: DraftClauseNameSchema,
  egcs_ay_description_en: DraftClauseTextSchema,
  egcs_ay_description_fr: DraftClauseTextSchema,
  egcs_ay_active: z.boolean(),
  rows: z.array(AgencyClauseTextSchema)
}).strict()

export const AgencyClauseCreateSchema = AgencyClauseUpdateSchema.extend({
  egcs_ay_languageindependentcode: LanguageIndependentCodeSchema
})

export const PublishedAgencyClauseSchema = z.object({
  kind: z.literal('agency_clause'),
  clauseId: PositivePostgresBigintIdSchema,
  agencyId: PositivePostgresBigintIdSchema,
  code: LanguageIndependentCodeSchema,
  nameEn: ClauseNameSchema.min(1, { error: 'validation.name_en_required' }),
  nameFr: ClauseNameSchema.min(1, { error: 'validation.name_fr_required' }),
  descriptionEn: RequiredClauseTextSchema,
  descriptionFr: RequiredClauseTextSchema,
  rows: z.array(z.object({
    textEn: RequiredClauseTextSchema,
    textFr: RequiredClauseTextSchema,
    displayOrder: ClauseOrderSchema
  })).min(1, { error: 'validation.required' })
})

export type AgencyClauseDraft = z.infer<typeof AgencyClauseCreateSchema>
export type AgencyClauseText = z.infer<typeof AgencyClauseTextSchema>
export type AgencyClauseItem = AgencyClauseDraft & {
  id: string
  publicationState: PublicationState
  hasUnpublishedChanges: boolean
}
export type PublishedAgencyClause = z.infer<typeof PublishedAgencyClauseSchema>
