import { setResponseHeader, type H3Event } from 'h3'
import { getMigrationReadiness } from './migration-readiness'
import { throwApiError } from './api-errors'

/**
 * Explains why requests are blocked without exposing database connection details.
 * @param event - Current request, whose locale selects the public message.
 * @returns Never returns; throws the existing service-unavailable contract.
 */
export const startupUnavailable = async (event: H3Event): Promise<never> => {
  const failed = getMigrationReadiness() === 'failed'
  setResponseHeader(event, 'Retry-After', 5)
  return await throwApiError(event, {
    statusCode: 503,
    code: 'HEALTH_UNAVAILABLE',
    key: failed ? 'apiErrors.health.startup_failed' : 'apiErrors.health.starting'
  })
}
