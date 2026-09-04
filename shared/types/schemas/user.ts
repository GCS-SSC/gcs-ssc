import { z } from 'zod'

export const UserProfileSchema = z.object({
  id: z.string().optional(),
  name: z.string({ error: 'validation.name_en_required' }).min(1, { error: 'validation.name_en_required' }),
  email: z.string({ error: 'validation.invalid_email' }).email({ error: 'validation.invalid_email' }),
  image: z.string().nullable().optional()
})

export type UserProfileItem = z.infer<typeof UserProfileSchema>
export const UserProfilePatchSchema = UserProfileSchema.omit({ id: true }).partial().strict().refine(
  value => Object.keys(value).length > 0,
  { message: 'validation.required' }
)

export const UserActivationSchema = z.object({
  password: z.string({ error: 'validation.required' })
    .min(8, { error: 'validation.min_length' })
}).strict()

export type UserActivation = z.infer<typeof UserActivationSchema>
