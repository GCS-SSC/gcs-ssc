import { defineEventHandler, getRequestURL } from 'h3'
import { requireAuthContext } from '~~/server/utils/authorize'
import { getMigrationReadiness } from '~~/server/utils/migration-readiness'
import { startupUnavailable } from '~~/server/utils/startup-unavailable'
import { requireBusinessRequestIntent } from '~~/server/utils/request-intent'

/**
 * Establishes an active authenticated user before any protected API handler runs.
 *
 * Per-route authorization remains mandatory. This boundary only prevents request
 * validation, parameter checks, and ownership lookups from running first.
 */
export default defineEventHandler(async event => {
  const path = getRequestURL(event).pathname
  if (path !== '/api/auth' && !path.startsWith('/api/')) {
    return
  }

  // Failed startup leaves the driver in bootstrap mode, with audit capture disabled.
  // Block even authentication and public metadata before they can use that driver.
  if (path !== '/api/health' && getMigrationReadiness() !== 'ready') {
    return await startupUnavailable(event)
  }

  const isBetterAuthProtocol = path === '/api/auth' || path.startsWith('/api/auth/')
  const isPublicEnumMetadata = path === '/api/metadata/enums'
  const isPublicHealthCheck = path === '/api/health'
  if (isBetterAuthProtocol || isPublicEnumMetadata || isPublicHealthCheck) {
    return
  }

  await requireBusinessRequestIntent(event)
  await requireAuthContext(event)
})
