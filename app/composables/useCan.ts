/* eslint-disable jsdoc/require-jsdoc -- The local capability matcher is documented through its exported composable contract. */
import type { AbilityAction, AuthorizationSubject } from '~~/shared/utils/abilities'
import type { RoleScopeType } from '~~/shared/utils/role-scope'
import type { Scope } from '~~/shared/utils/scopes'

/**
 * Provides a concise `can(...)` wrapper over the auth authorization API.
 *
 * @returns Authorization helper.
 */
export const useCan = () => {
  const { authorize, hasAbility, canManageAssignments } = useAuth()

  /**
   * Evaluates if the current user is authorized to perform an action on a subject.
   *
   * @param subject - The target resource subject to check.
   * @param action - The action being performed.
   * @param scope - Explicit scope to evaluate.
   * @returns True if authorized, false otherwise.
   */
  const can = <A extends AbilityAction>(
    subject: AuthorizationSubject,
    action: A,
    scope: Scope
  ) => authorize(subject, action, scope)

  const canAny = <A extends AbilityAction>(
    subject: AuthorizationSubject,
    action: A,
    roleScopeTypes?: readonly RoleScopeType[]
  ) => roleScopeTypes === undefined
    ? hasAbility(subject, action)
    : hasAbility(subject, action, roleScopeTypes)

  return {
    can,
    canAny,
    canManageAssignments
  }
}
