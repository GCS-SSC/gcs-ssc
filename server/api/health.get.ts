import { defineEventHandler, type H3Event } from 'h3'
import { throwApiError } from '../utils/api-errors'
import { getMigrationReadiness } from '../utils/migration-readiness'

/**
 * Throws the stable localized readiness failure without exposing its cause.
 *
 * @param event - Current health request.
 * @returns Never returns; throws the standardized API error.
 */
const healthUnavailable = async (event: H3Event): Promise<never> => await throwApiError(event, {
  statusCode: 503,
  code: 'HEALTH_UNAVAILABLE',
  key: 'apiErrors.health.unavailable'
})

// eslint-disable-next-line local/require-authorize -- Deliberately public readiness probe with no environment details.
export default defineEventHandler(async (event) => {
  const readiness = getMigrationReadiness()
  if (readiness !== 'ready') {
    return await healthUnavailable(event)
  }
  try {
    await event.context.$dbHealthCheck()
    return { status: 'ok' }
  } catch {
    return await healthUnavailable(event)
  }
})
