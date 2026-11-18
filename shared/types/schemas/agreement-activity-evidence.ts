import { z } from 'zod'

const bilingualText = z.object({
  en: z.string(),
  fr: z.string()
})

export const AgreementActivityCustomFieldEvidenceSchema = z.object({
  fieldId: z.string(),
  label: bilingualText,
  display: z.union([z.string(), bilingualText])
})

export type AgreementActivityCustomFieldEvidence = z.infer<typeof AgreementActivityCustomFieldEvidenceSchema>
