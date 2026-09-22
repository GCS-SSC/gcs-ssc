import { z } from 'zod'

const IdSchema = z.preprocess(value => {
  if (value === undefined || value === null) {
    return ''
  }

  return value
}, z.coerce.string({ error: 'validation.id_required' }).min(1, { error: 'validation.id_required' })).meta({ formRequired: true })

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
