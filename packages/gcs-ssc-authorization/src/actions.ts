/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Public signatures fully describe these narrow guards. */
/** Actions understood by the application's authorization model. */
export const AUTHORIZATION_ACTIONS = ['create', 'read', 'update', 'delete'] as const

export type AuthorizationAction = (typeof AUTHORIZATION_ACTIONS)[number]

/** Independent roster-management grant emitted alongside expanded CRUD grants. */
export const MANAGE_ASSIGNMENTS_ACTION = 'manage_assignments' as const
export type StaticGrantAction = AuthorizationAction | typeof MANAGE_ASSIGNMENTS_ACTION

/** Narrows an unknown value to an authorization action. */
export const isAuthorizationAction = (value: unknown): value is AuthorizationAction => {
  return typeof value === 'string'
    && AUTHORIZATION_ACTIONS.includes(value as AuthorizationAction)
}
