import { z } from 'zod'
import { EnFrLabelSchema } from './common'

export const HelpSchema = z.object({
  title: EnFrLabelSchema,
  description: EnFrLabelSchema
})

export type Help = z.infer<typeof HelpSchema>
