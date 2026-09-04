import type { AssignableEntityType } from '~~/shared/types/database'
import {
  ENTITY_AUTHORIZATION_POLICIES,
  type AssignableEntityMetadata
} from '~~/shared/utils/entity-assignments'

export type EntityAuthorizationPolicy = AssignableEntityMetadata
/**
 * Returns the single declarative policy for an assignable entity type.
 * @param entityType Exact assignable entity type.
 * @returns The entity's authorization policy.
 */
export const getEntityAuthorizationPolicy = (entityType: AssignableEntityType): EntityAuthorizationPolicy =>
  ENTITY_AUTHORIZATION_POLICIES[entityType]
