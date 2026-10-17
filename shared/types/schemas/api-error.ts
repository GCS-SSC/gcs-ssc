import { z } from 'zod'

/** Optional host-owned presentation metadata; the localized API message remains authoritative. */
export const ApiErrorTranslationSchema = z.object({
  key: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
})

export type ApiErrorTranslation = z.infer<typeof ApiErrorTranslationSchema>
