import { z } from 'zod'

export const CorrectionExportSchema = z.object({
  fields: z.array(z.string()),
  data: z.array(z.array(z.string().nullable()))
})

export type CorrectionExport = z.infer<typeof CorrectionExportSchema>
