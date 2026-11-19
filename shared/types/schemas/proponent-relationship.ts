import { z } from 'zod'
import { PositivePostgresBigintIdSchema } from './common'

export const ProponentRelationshipPatchSchema = z.object({
  egcs_ar_relationshiptype: PositivePostgresBigintIdSchema,
  egcs_ar_reversed: z.boolean()
}).partial()

export const ProponentRelationshipCreateSchema = z.object({
  egcs_ar_agency: PositivePostgresBigintIdSchema,
  egcs_ar_relatedproponent: PositivePostgresBigintIdSchema,
  egcs_ar_relationshiptype: PositivePostgresBigintIdSchema,
  egcs_ar_reversed: z.boolean().optional()
})

export type ProponentRelationshipCreate = z.infer<typeof ProponentRelationshipCreateSchema>
export type ProponentRelationshipPatch = z.infer<typeof ProponentRelationshipPatchSchema>
