import { z } from 'zod'

export const ReviewSetListRoleCapabilitiesSchema = z.object({
  can_create_role: z.boolean()
})

export const ReviewSetRoleCapabilitiesSchema = z.object({
  can_cancel_role: z.boolean()
})

export type ReviewSetListRoleCapabilities = z.infer<typeof ReviewSetListRoleCapabilitiesSchema>
export type ReviewSetRoleCapabilities = z.infer<typeof ReviewSetRoleCapabilitiesSchema>
