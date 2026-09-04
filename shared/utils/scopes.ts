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

/** @deprecated Scope hierarchy is owned by `@gcs-ssc/authorization`. */
export const SCOPE_DEFINITIONS = {
  global: { parent: null, idKeys: [] },
  agency: { parent: 'global', idKeys: ['agencyId'] },
  program: { parent: 'agency', idKeys: ['agencyId', 'transferPaymentId'] },
  entity: { parent: 'program', idKeys: ['agencyId'] }
} as const

/** Compatibility adapter for the package-owned scope policy. */
export const isScopeCovered = (
  grantScope: Scope,
  requiredScope: Scope
): boolean => isAuthorizationScopeCovered(grantScope, requiredScope)
