import { z } from 'zod'
import { PositivePostgresBigintIdSchema } from './common'

const Name = z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' }).max(255, { error: 'validation.max_length' })

export const AgencyFundingTypeBaseSchema = z.object({
  egcs_ay_name_en: Name,
  egcs_ay_name_fr: Name,
  egcs_ay_instacking: z.boolean().default(false),
  egcs_ay_incostsharing: z.boolean().default(false),
  egcs_ay_active: z.boolean().default(true)
})
export const AgencyFundingTypePatchSchema = AgencyFundingTypeBaseSchema.omit({ egcs_ay_active: true }).partial()

export const AgencyFundingSubtypeBaseSchema = z.object({
  egcs_ay_name_en: Name,
  egcs_ay_name_fr: Name,
  egcs_ay_active: z.boolean().default(true)
})
export const AgencyFundingSubtypePatchSchema = AgencyFundingSubtypeBaseSchema.omit({ egcs_ay_active: true }).partial()

export const StreamFundingSubtypeSchema = z.object({
  egcs_tp_fundingsubtype: PositivePostgresBigintIdSchema
}).strict()

export const StreamFundingRequirementsSchema = z.object({
  egcs_tp_requireforecastfundingbreakdown: z.boolean(),
  egcs_tp_requireclaimfundingbreakdown: z.boolean()
}).strict()
