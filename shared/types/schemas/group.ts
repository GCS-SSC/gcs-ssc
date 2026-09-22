import { z } from 'zod'
import { PositivePostgresBigintIdSchema } from './common'

export const GroupCreateSchema = z.object({
  egcs_cn_agency: PositivePostgresBigintIdSchema,
  egcs_cn_name_en: z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' }),
  egcs_cn_name_fr: z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' }),
  egcs_cn_email: z.email({ error: 'validation.invalid_email' }).toLowerCase()
}).strict()

export const GroupPatchSchema = GroupCreateSchema.omit({ egcs_cn_agency: true }).partial().strict()

export const GroupMemberSchema = z.object({
  egcs_cn_user: PositivePostgresBigintIdSchema
}).strict()

export type GroupCreate = z.infer<typeof GroupCreateSchema>
export type GroupPatch = z.infer<typeof GroupPatchSchema>
