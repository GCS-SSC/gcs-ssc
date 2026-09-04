/* eslint-disable jsdoc/require-jsdoc -- Role-scope functions retain descriptive exported names and explicit types. */
import type { RoleAbilitySubject } from './abilities'
import type { RoleScope } from './scopes'

export const ROLE_SCOPE_TYPES = ['global', 'agency', 'program'] as const
export type RoleScopeType = (typeof ROLE_SCOPE_TYPES)[number]

export const ROLE_ABILITY_SCOPE_MATRIX: Record<RoleAbilitySubject, readonly RoleScopeType[]> = {
  system: ['global'],
  agency: ['global', 'agency'],
  transfer_payment: ['global', 'agency', 'program'],
  role: ['global', 'agency'],
  user: ['global', 'agency'],
  agreement: ['global', 'agency', 'program'],
  applicant_recipient: ['global', 'agency']
}

export const ASSIGNMENT_MANAGEMENT_SUBJECTS = [
  'agreement',
  'applicant_recipient'
] as const satisfies readonly RoleAbilitySubject[]

export const canSubjectManageAssignments = (subject: string): subject is (typeof ASSIGNMENT_MANAGEMENT_SUBJECTS)[number] =>
  ASSIGNMENT_MANAGEMENT_SUBJECTS.includes(subject as (typeof ASSIGNMENT_MANAGEMENT_SUBJECTS)[number])

export const isRoleScopeType = (value: unknown): value is RoleScopeType => {
  return typeof value === 'string'
    && ROLE_SCOPE_TYPES.includes(value as RoleScopeType)
}

export const getRoleScopeType = (
  roleAgencyId: string | null | undefined,
  scopedProgramCount: number
): RoleScopeType => {
  if (roleAgencyId === null || roleAgencyId === undefined) return 'global'
  if (scopedProgramCount > 0) return 'program'
  return 'agency'
}

export const isAbilityAllowedForRoleScope = (
  subject: string,
  roleScopeType: RoleScopeType
): boolean => {
  const allowedScopes = ROLE_ABILITY_SCOPE_MATRIX[subject as RoleAbilitySubject]
  return allowedScopes?.includes(roleScopeType) === true
}

export const buildRoleGrantScope = (
  roleScopeType: RoleScopeType,
  agencyId?: string | null,
  transferPaymentId?: string
): RoleScope | null => {
  if (roleScopeType === 'global') return { type: 'global' }
  if (!agencyId) return null

  if (roleScopeType === 'agency') {
    return { type: 'agency', agencyId }
  }

  if (!transferPaymentId) return null
  return { type: 'program', agencyId, transferPaymentId }
}
