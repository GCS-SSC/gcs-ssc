import { z } from 'zod'

export const SearchQuerySchema = z.object({
  search: z.string().trim().max(200, { error: 'validation.max_length' })
    .refine(value => !value.includes('\u0000'), { error: 'validation.invalid_text_character' }).optional()
})

export type SearchQuery = z.infer<typeof SearchQuerySchema>
