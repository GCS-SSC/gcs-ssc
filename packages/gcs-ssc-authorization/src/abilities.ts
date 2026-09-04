/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Public signatures fully describe these narrow guards. */
import type { AuthorizationAction } from './actions'
import { isAuthorizationAction } from './actions'

/** Subjects that may be stored on a role permission. */
export const ROLE_PERMISSION_SUBJECTS = [
  'system',
  'agency',
  'transfer_payment',
  'role',
  'user',
  'agreement',
  'applicant_recipient'
] as const

/** All subjects understood by authorization. */
export const AUTHORIZATION_SUBJECTS = ROLE_PERMISSION_SUBJECTS

/** @deprecated Use ROLE_PERMISSION_SUBJECTS. */
export const ROLE_ABILITY_SUBJECTS = ROLE_PERMISSION_SUBJECTS

export type RolePermissionSubject = (typeof ROLE_PERMISSION_SUBJECTS)[number]
/** @deprecated Use RolePermissionSubject. */
export type RoleAbilitySubject = RolePermissionSubject
export type AuthorizationSubject = (typeof AUTHORIZATION_SUBJECTS)[number]

export type RoleAbility = {
  action: AuthorizationAction
  subject: RoleAbilitySubject
}

/** Checks whether a value is a supported role ability. */
export const isRoleAbility = (
  value: { action: unknown; subject: unknown }
): value is RoleAbility => {
  return isAuthorizationAction(value.action)
    && typeof value.subject === 'string'
    && ROLE_PERMISSION_SUBJECTS.includes(value.subject as RolePermissionSubject)
}

/** Checks whether a value is a supported authorization subject. */
export const isAuthorizationSubject = (value: unknown): value is AuthorizationSubject => {
  return typeof value === 'string'
    && AUTHORIZATION_SUBJECTS.includes(value as AuthorizationSubject)
}

/** Narrows an authorization subject to the subset assignable to roles. */
export const isRoleAbilitySubject = (
  subject: string
): subject is RoleAbilitySubject => ROLE_ABILITY_SUBJECTS.includes(subject as RoleAbilitySubject)
