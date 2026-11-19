import { z } from 'zod'
import { PositivePostgresBigintIdSchema } from './common'

export const AgreementClauseSelectionSchema = z.object({
  egcs_fc_clause: PositivePostgresBigintIdSchema.meta({ formRequired: true })
})
