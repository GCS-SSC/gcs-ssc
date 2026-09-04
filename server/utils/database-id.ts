import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

/**
 * Checks the route representation used by positive PostgreSQL bigint identifiers.
 *
 * @param value Route parameter to inspect.
 * @returns Whether the value is a positive decimal integer string.
 */
export const isDecimalDatabaseId = (value: string | undefined): value is string =>
  typeof value === 'string' && isPositivePostgresBigintText(value)
