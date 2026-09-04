import { z } from 'zod'
import { ASSIGNABLE_ENTITY_TYPE_ENUM } from '~~/shared/constants/enums'
import { AssignableEntityTypeIdentitySchema, PositivePostgresBigintIdSchema } from './common'
import { isPositivePostgresBigintText } from '../../utils/database-id'

export type { AssignableEntityType } from '~~/shared/constants/enums'

export const AssignableEntityTypeSchema = z.enum(ASSIGNABLE_ENTITY_TYPE_ENUM, { error: 'validation.required' })
export const EntityAssignmentTargetSchema = z.object({
  entityType: AssignableEntityTypeIdentitySchema,
  entityId: z.coerce.string().min(1, { error: 'validation.required' })
}).superRefine((target, ctx) => {
  if (!target.entityType.includes(':') && !isPositivePostgresBigintText(target.entityId)) {
    ctx.addIssue({ code: 'custom', message: 'validation.invalid_selection', path: ['entityId'] })
  }
})
export const EntityAssignmentCreateSchema = z.object({
  userId: PositivePostgresBigintIdSchema
})
export const EntityAssignmentRemoveSchema = EntityAssignmentCreateSchema
export const EntityAssignmentPromoteSchema = EntityAssignmentCreateSchema
export const EntityAssignmentContextSchema = z.object({
  id: z.coerce.string(),
  egcs_fc_agreementnumber: z.string(),
  egcs_fc_title_en: z.string(),
  egcs_fc_title_fr: z.string(),
  can_read_agreement: z.boolean()
})
export const AssignedWorkQuerySchema = z.object({
  search: z.string().trim().optional(),
  entityType: AssignableEntityTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
})

export type EntityAssignmentCreate = z.infer<typeof EntityAssignmentCreateSchema>
export type EntityAssignmentContext = z.infer<typeof EntityAssignmentContextSchema>
