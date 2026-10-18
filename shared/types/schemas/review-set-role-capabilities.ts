import { z } from 'zod'

// Only missing legacy metadata permits a client fallback. Supplied invalid values fail closed.
const OptionalRoleCapabilitySchema = z.boolean().catch(false).optional()

export const ReviewSetListRoleCapabilitiesSchema = z.object({
  can_create_role: OptionalRoleCapabilitySchema
})

export const ReviewSetRoleCapabilitiesSchema = z.object({
  can_cancel_role: OptionalRoleCapabilitySchema
})

export type ReviewSetListRoleCapabilities = z.infer<typeof ReviewSetListRoleCapabilitiesSchema>
export type ReviewSetRoleCapabilities = z.infer<typeof ReviewSetRoleCapabilitiesSchema>
