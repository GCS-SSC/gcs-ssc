import { z } from 'zod'

const IdSchema = z.preprocess(value => {
  if (value === undefined || value === null) {
    return ''
  }

  return value
}, z.coerce.string({ error: 'validation.id_required' }).min(1, { error: 'validation.id_required' }))

export const AdditionalReviewerInputSchema = z.object({
  egcs_cn_user: IdSchema,
  egcs_cn_comments: z.string().default('')
})

export type AdditionalReviewerInput = z.infer<typeof AdditionalReviewerInputSchema>
