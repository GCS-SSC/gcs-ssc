import { z } from 'zod'
import type { AbilityAction, AuthorizationSubject } from '~~/shared/utils/abilities'
import { AUTHORIZATION_ACTIONS } from '@gcs-ssc/authorization'
import {
  AUTHORIZATION_SUBJECTS,
  isAuthorizationSubject
} from '~~/shared/utils/abilities'
import { canSubjectManageAssignments, isAbilityAllowedForRoleScope } from '~~/shared/utils/role-scope'
import type { RoleScope } from '~~/shared/utils/scopes'

export interface SocialLoginResult {
  url?: string
}

export type StaticPermissionSource = 'role'
export type StaticPermissionAction = AbilityAction | 'manage_assignments'
export type StaticPermissionScope = RoleScope

export interface StaticPermissionGrant {
  source: StaticPermissionSource
  action: StaticPermissionAction
  subject: AuthorizationSubject
  scope: StaticPermissionScope
}

const RequiredPermissionScopeIdSchema = z.union([
  z.string().min(1),
  z.number()
]).transform(value => String(value))

const StaticPermissionScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('global') }).strict(),
  z.object({
    type: z.literal('agency'),
    agencyId: RequiredPermissionScopeIdSchema
  }).strict(),
  z.object({
    type: z.literal('program'),
    agencyId: RequiredPermissionScopeIdSchema,
    transferPaymentId: RequiredPermissionScopeIdSchema
  }).strict()
])

export const StaticPermissionGrantSchema = z.object({
  source: z.literal('role'),
  action: z.enum([...AUTHORIZATION_ACTIONS, 'manage_assignments']),
  subject: z.enum(AUTHORIZATION_SUBJECTS),
  scope: StaticPermissionScopeSchema
}).superRefine((grant, context) => {
  if (!isAuthorizationSubject(grant.subject)) {
    context.addIssue({
      code: 'custom',
      path: ['subject'],
      message: 'validation.invalid_selection'
    })
    return
  }

  if (!isAbilityAllowedForRoleScope(grant.subject, grant.scope.type)) {
    context.addIssue({
      code: 'custom',
      path: ['scope'],
      message: 'validation.invalid_role_scope_type'
    })
  }
  if (grant.action === 'manage_assignments' && !canSubjectManageAssignments(grant.subject)) {
    context.addIssue({
      code: 'custom',
      path: ['subject'],
      message: 'validation.invalid_selection'
    })
  }
})

export const StaticPermissionsResponseSchema = z.object({
  grants: z.array(StaticPermissionGrantSchema)
}).strict()

export const StaticPermissionsEnvelopeSchema = z.object({
  grants: z.array(z.unknown())
}).strict()

export type StaticPermissionsResponse = z.infer<typeof StaticPermissionsResponseSchema>
