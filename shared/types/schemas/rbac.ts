import { z } from 'zod'
import { ROLE_ABILITY_SUBJECTS, type RoleAbilitySubject } from '@gcs-ssc/authorization'
import { canSubjectManageAssignments } from '~~/shared/utils/role-scope'
import { PositivePostgresBigintIdSchema } from './common'

export const ROLE_ACCESS_LEVELS = ['viewer', 'contributor', 'manager'] as const
export type RoleAccessLevel = (typeof ROLE_ACCESS_LEVELS)[number]

/** Validates the decimal string form used by PostgreSQL bigint role IDs at API boundaries. */
export const RoleIdSchema = PositivePostgresBigintIdSchema

export const RolePermissionSchema = z.object({
  subject: z.enum(ROLE_ABILITY_SUBJECTS),
  access_level: z.enum(ROLE_ACCESS_LEVELS).nullable(),
  can_manage_assignments: z.boolean().default(false)
}).superRefine((permission, context) => {
  if (permission.access_level === null && !permission.can_manage_assignments) {
    context.addIssue({
      code: 'custom',
      path: ['access_level'],
      message: 'validation.role_permission_ineffective'
    })
  }
  if (permission.can_manage_assignments && !canSubjectManageAssignments(permission.subject)) {
    context.addIssue({
      code: 'custom',
      path: ['can_manage_assignments'],
      message: 'validation.invalid_selection'
    })
  }
})

export type RolePermissionInput = z.infer<typeof RolePermissionSchema>

const RoleCoreFields = {
  name_en: z.string({ error: 'validation.name_en_required' }).min(1, { error: 'validation.name_en_required' }),
  name_fr: z.string({ error: 'validation.name_fr_required' }).min(1, { error: 'validation.name_fr_required' }),
  description_en: z.string().nullable().optional(),
  description_fr: z.string().nullable().optional(),
  permissions: z.array(RolePermissionSchema)
}

/**
 * Adds a validation issue for each repeated subject permission.
 * @param permissions Permission rows to inspect.
 * @param context Zod refinement context receiving issues.
 */
const validateUniquePermissions = (
  permissions: Array<{ subject: RoleAbilitySubject }>,
  context: z.RefinementCtx
): void => {
  const seen = new Set<RoleAbilitySubject>()
  permissions.forEach((permission, index) => {
    if (seen.has(permission.subject)) {
      context.addIssue({
        code: 'custom',
        message: 'validation.duplicate_role_permission',
        path: ['permissions', index]
      })
    }
    seen.add(permission.subject)
  })
}

export const RoleSchema = z.object({
  id: PositivePostgresBigintIdSchema.nullable().optional(),
  agency_id: PositivePostgresBigintIdSchema.nullable().optional(),
  transfer_payment_ids: z.array(PositivePostgresBigintIdSchema).default([]),
  ...RoleCoreFields
}).superRefine((value, context) => validateUniquePermissions(value.permissions, context))

export type RoleInput = z.infer<typeof RoleSchema>

const RolePatchBaseSchema = z.object({
  id: PositivePostgresBigintIdSchema.nullable().optional(),
  agency_id: PositivePostgresBigintIdSchema.nullable().optional(),
  transfer_payment_ids: z.array(PositivePostgresBigintIdSchema).optional(),
  ...RoleCoreFields
})

export const RolePatchSchema = RolePatchBaseSchema
  .superRefine((value, context) => validateUniquePermissions(value.permissions, context))

export type RolePatchInput = z.infer<typeof RolePatchSchema>

export const RoleProfilePatchSchema = RolePatchBaseSchema
  .omit({ permissions: true, agency_id: true })
  .partial()
  .strict()

export const RolePermissionMutationSchema = z.object({
  subject: z.enum(ROLE_ABILITY_SUBJECTS),
  permission: RolePermissionSchema.nullable()
}).strict().superRefine((value, context) => {
  if (value.permission && value.permission.subject !== value.subject) {
    context.addIssue({
      code: 'custom',
      path: ['permission', 'subject'],
      message: 'validation.invalid_selection'
    })
  }
})

export const UserRoleAssignmentSchema = z.object({
  id: z.string().nullable().optional(),
  user_id: PositivePostgresBigintIdSchema,
  role_id: RoleIdSchema
})

export type UserRoleAssignment = z.infer<typeof UserRoleAssignmentSchema>
