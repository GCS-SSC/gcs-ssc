import { z } from 'zod'
import { OptionalShortDescriptionSchema, PositivePostgresBigintIdSchema } from './common'

export const AgreementRelationshipPatchSchema = z.object({
  egcs_fc_relationshiptype: PositivePostgresBigintIdSchema,
  egcs_fc_description: OptionalShortDescriptionSchema
})

export const AgreementRelationshipCreateSchema = AgreementRelationshipPatchSchema.extend({
  egcs_fc_relatedagreement: PositivePostgresBigintIdSchema
})
