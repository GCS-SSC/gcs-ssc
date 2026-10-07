/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Compatibility adapter signatures mirror the package-owned scope policy. */
import {
  isAuthorizationScopeCovered,
  type AgencyScope,
  type AuthorizationScope,
  type EntityScope,
  type GlobalScope,
  type ProgramScope,
  type RoleScope
} from '@gcs-ssc/authorization'

/** @deprecated Import scope types from `@gcs-ssc/authorization`. */
export type { AgencyScope, EntityScope, GlobalScope, ProgramScope, RoleScope }
export type Scope = AuthorizationScope

/** Compatibility adapter for the package-owned scope policy. */
export const isScopeCovered = (
  grantScope: Scope,
  requiredScope: Scope
): boolean => isAuthorizationScopeCovered(grantScope, requiredScope)
