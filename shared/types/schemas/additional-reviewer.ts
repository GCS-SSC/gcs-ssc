import { z } from 'zod'
import { PositivePostgresBigintIdSchema } from './common'

const IdSchema = PositivePostgresBigintIdSchema.meta({ formRequired: true })

export const AdditionalReviewerInputSchema = z.object({
  egcs_cn_user: IdSchema.optional(),
  egcs_cn_group: IdSchema.optional(),
  egcs_cn_comments: z.string().default('')
}).superRefine((value, ctx) => {
  if (Number(Boolean(value.egcs_cn_user)) + Number(Boolean(value.egcs_cn_group)) !== 1) {
    ctx.addIssue({ code: 'custom', message: 'validation.invalid_selection', path: ['egcs_cn_user'] })
  }
})

export type AdditionalReviewerInput = z.infer<typeof AdditionalReviewerInputSchema>
